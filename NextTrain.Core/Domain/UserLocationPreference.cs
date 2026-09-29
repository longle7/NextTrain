namespace NextTrain.Core.Domain
{
    /// <summary>
    /// Represents a saved location (e.g., home or work) for nearest-station queries.
    /// </summary>
    public class UserLocationPreference
    {
        // Primary key.
        public int Id { get; set; }

        // Foreign key to the user.
        public string UserId { get; set; } = string.Empty;

        // Label for the location (e.g., "Home", "Work").
        public string Label { get; set; } = "Home";

        // Latitude and longitude for the saved location.
        public double Latitude { get; set; }
        public double Longitude { get; set; }

        // Timestamps.
        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
        public DateTime? UpdatedAtUtc { get; set; }
    }
}