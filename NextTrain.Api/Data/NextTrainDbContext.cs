using Microsoft.EntityFrameworkCore;
using NextTrain.Core.Domain;

namespace NextTrain.Api.Data
{
    /// <summary>
    /// The database, as EF Core sees it: each DbSet below is a table, and OnModelCreating spells out keys,
    /// indexes, and column sizes. After changing an entity or this file, add a migration
    /// (dotnet ef migrations add <Name> --project NextTrain.Api); the API applies pending migrations at startup.
    /// </summary>
    public class NextTrainDbContext : DbContext
    {
        public NextTrainDbContext(DbContextOptions<NextTrainDbContext> options)
            : base(options)
        {
        }

        // DbSets = tables (named after the property: "Stations", "UserCommutes"; "Id" is each one's key).
        public DbSet<Station> Stations { get; set; } = null!;
        public DbSet<UserCommute> UserCommutes { get; set; } = null!;

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            modelBuilder.Entity<Station>(entity =>
            {
                entity.HasIndex(s => s.MbtaStopId).IsUnique();
                entity.Property(s => s.MbtaStopId).IsRequired().HasMaxLength(50);
                entity.Property(s => s.Name).IsRequired().HasMaxLength(200);
                entity.Property(s => s.RouteId).HasMaxLength(50);
            });

            modelBuilder.Entity<UserCommute>(entity =>
            {
                entity.HasIndex(uc => uc.UserId);
                entity.Property(uc => uc.UserId).IsRequired().HasMaxLength(100);
                entity.Property(uc => uc.RouteId).IsRequired().HasMaxLength(50);
                entity.Property(uc => uc.ActiveDays).IsRequired().HasMaxLength(50);
                entity.HasOne(uc => uc.Station)
                      .WithMany()
                      .HasForeignKey(uc => uc.StationId)
                      .OnDelete(DeleteBehavior.Restrict);
            });
        }
    }
}
