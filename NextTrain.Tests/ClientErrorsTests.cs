using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace NextTrain.Tests;

/// <summary>
/// POST /client-errors: the app's error reports are logged as one line, validated, and rate limited.
/// </summary>
public class ClientErrorsTests : IDisposable
{
    // Collects what the API logs, to check what a report writes.
    private sealed class CapturingLogger(ConcurrentQueue<string> lines) : ILogger, ILoggerProvider
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => logLevel >= LogLevel.Warning;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
            lines.Enqueue(formatter(state, exception));
        public ILogger CreateLogger(string categoryName) => this;
        public void Dispose() { }
    }

    private readonly ConcurrentQueue<string> _logged = new();
    private readonly WebApplicationFactory<Program> _factory;

    public ClientErrorsTests()
    {
        _factory = TestDb.Api(b => b.ConfigureServices(services => services.AddSingleton<ILoggerProvider>(new CapturingLogger(_logged))));
    }

    public void Dispose() => _factory.Dispose();

    private static HttpRequestMessage Report(object body, string ip = "203.0.113.7") => new(HttpMethod.Post, "/client-errors")
    {
        Content = JsonContent.Create(body),
        Headers = { { "X-Forwarded-For", ip } },
    };

    [Fact]
    public async Task AReport_IsLoggedAsOneLine()
    {
        using var client = _factory.CreateClient();

        var response = await client.SendAsync(Report(new
        {
            message = "TypeError: x is undefined\nforged line",
            stack = "at a (app.js:1:2)\nat b (app.js:3:4)",
            page = "/stations/place-pktrm",
            version = "1.3 (9)",
            platform = "ios",
        }));

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var line = Assert.Single(_logged, l => l.StartsWith("App error"));
        Assert.Equal("App error on /stations/place-pktrm (ios 1.3 (9)): TypeError: x is undefined | forged line || at a (app.js:1:2) | at b (app.js:3:4)", line);
    }

    [Theory]
    [InlineData(null, "/")]                         // no message
    [InlineData("boom", "/stations/66?stop=secret")] // a query string, not just a path
    [InlineData("boom", "https://elsewhere.example/")] // not a path at all
    public async Task AnInvalidReport_Returns400(string? message, string page)
    {
        using var client = _factory.CreateClient();

        var response = await client.SendAsync(Report(new { message, page }));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task MoreThanTenAMinuteFromOneClient_Returns429()
    {
        using var client = _factory.CreateClient();
        for (var i = 0; i < 10; i++)
            Assert.Equal(HttpStatusCode.NoContent, (await client.SendAsync(Report(new { message = $"error {i}" }, "203.0.113.8"))).StatusCode);

        Assert.Equal(HttpStatusCode.TooManyRequests, (await client.SendAsync(Report(new { message = "one too many" }, "203.0.113.8"))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.SendAsync(Report(new { message = "another device" }, "203.0.113.9"))).StatusCode);
    }
}
