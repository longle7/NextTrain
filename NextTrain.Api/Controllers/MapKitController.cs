using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;

namespace NextTrain.Api.Controllers
{
    /// <summary>
    /// Tokens for Apple Maps (MapKit JS), which draws the app's map. MapKit asks for a token when the map loads and
    /// again before it expires. A token is a JWT signed with our MapKit private key, which stays on the server.
    ///
    /// Settings (from Apple's developer account): MapKit:TeamId, MapKit:KeyId, and MapKit:PrivateKey (the .p8 file's
    /// contents). Until they're set, this answers 404 and the app has no map.
    /// </summary>
    [ApiController]
    [Route("mapkit")]
    public class MapKitController : ControllerBase
    {
        // Short, so a copied token is soon useless; MapKit fetches a new one on its own.
        public static readonly TimeSpan TokenLifetime = TimeSpan.FromMinutes(30);

        // GET /mapkit/token: a JWT as plain text, locked to the calling site (its Origin) so it only works there.
        // Only the app's own origins get one: the configured CORS origins, plus same-origin calls in Development
        // (the Vite proxy sends no Origin).
        [HttpGet("token")]
        public IActionResult GetToken([FromServices] IConfiguration config, [FromServices] IWebHostEnvironment env)
        {
            string? teamId = config["MapKit:TeamId"], keyId = config["MapKit:KeyId"], privateKey = config["MapKit:PrivateKey"];
            if (string.IsNullOrWhiteSpace(teamId) || string.IsNullOrWhiteSpace(keyId) || string.IsNullOrWhiteSpace(privateKey))
            {
                return Problem("Maps aren't set up on this server.", statusCode: StatusCodes.Status404NotFound);
            }

            string? origin = Request.Headers.Origin;
            var allowed = config.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
            if (origin is null ? !env.IsDevelopment() : !allowed.Contains(origin))
            {
                return Problem("This site can't use NextTrain's maps.", statusCode: StatusCodes.Status403Forbidden);
            }

            Response.Headers.CacheControl = "no-store";
            return Content(CreateToken(teamId, keyId, privateKey, origin, DateTimeOffset.UtcNow), "text/plain");
        }

        // A JWT is base64url(header).base64url(payload).base64url(signature). Apple wants ES256: an ECDSA P-256
        // signature over SHA-256, as the raw 64-byte r|s pair (.NET's default format).
        public static string CreateToken(string teamId, string keyId, string privateKeyPem, string? origin, DateTimeOffset now)
        {
            var header = new Dictionary<string, object> { ["alg"] = "ES256", ["kid"] = keyId, ["typ"] = "JWT" };
            var payload = new Dictionary<string, object>
            {
                ["iss"] = teamId,
                ["iat"] = now.ToUnixTimeSeconds(),
                ["exp"] = now.Add(TokenLifetime).ToUnixTimeSeconds(),
            };
            if (origin is not null) payload["origin"] = origin;

            var unsigned = Base64Url(JsonSerializer.SerializeToUtf8Bytes(header)) + "." + Base64Url(JsonSerializer.SerializeToUtf8Bytes(payload));
            using var key = ECDsa.Create();
            key.ImportFromPem(privateKeyPem);
            return unsigned + "." + Base64Url(key.SignData(Encoding.ASCII.GetBytes(unsigned), HashAlgorithmName.SHA256));
        }

        private static string Base64Url(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }
}
