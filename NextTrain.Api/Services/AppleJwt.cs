using System.Buffers.Text;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace NextTrain.Api.Services
{
    /// <summary>
    /// Tokens for Apple's services (MapKit JS, push notifications), signed with a key from the Apple Developer account.
    /// </summary>
    public static class AppleJwt
    {
        // A JWT is base64url(header).base64url(claims).base64url(signature). Apple wants ES256: an ECDSA P-256 signature
        // over SHA-256, as the raw 64-byte r|s pair (.NET's default format).
        public static string Create(string keyId, string privateKeyPem, IDictionary<string, object> claims)
        {
            var header = new Dictionary<string, object> { ["alg"] = "ES256", ["kid"] = keyId, ["typ"] = "JWT" };
            var unsigned = Base64Url.EncodeToString(JsonSerializer.SerializeToUtf8Bytes(header)) + "." + Base64Url.EncodeToString(JsonSerializer.SerializeToUtf8Bytes(claims));
            using var key = ECDsa.Create();
            key.ImportFromPem(privateKeyPem);
            return unsigned + "." + Base64Url.EncodeToString(key.SignData(Encoding.ASCII.GetBytes(unsigned), HashAlgorithmName.SHA256));
        }
    }
}
