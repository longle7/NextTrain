using Microsoft.EntityFrameworkCore;
using NextTrain.Core.Domain;
using static System.Collections.Specialized.BitVector32;

namespace NextTrain.Api.Data
{
    /// <summary>
    /// EF Core DbContext for NextTrain, mapping domain entities to SQL Server tables.
    /// </summary>
    public class NextTrainDbContext : DbContext
    {
        public NextTrainDbContext(DbContextOptions<NextTrainDbContext> options)
            : base(options)
        {
        }

        // DbSets = tables
        public DbSet<Station> Stations { get; set; } = null!;
        public DbSet<CachedPrediction> CachedPredictions { get; set; } = null!;
        public DbSet<UserCommute> UserCommutes { get; set; } = null!;
        public DbSet<NotificationSubscription> NotificationSubscriptions { get; set; } = null!;
        public DbSet<UserLocationPreference> UserLocationPreferences { get; set; } = null!;
        public DbSet<VehicleStatus> VehicleStatuses { get; set; } = null!; // optional

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // Station configuration.
            modelBuilder.Entity<Station>(entity =>
            {
                entity.ToTable("Stations");

                entity.HasKey(s => s.Id);

                entity.HasIndex(s => s.MbtaStopId)
                      .IsUnique();

                entity.Property(s => s.MbtaStopId)
                      .IsRequired()
                      .HasMaxLength(50);

                entity.Property(s => s.Name)
                      .IsRequired()
                      .HasMaxLength(200);

                entity.Property(s => s.RouteId)
                      .HasMaxLength(50);

                entity.Property(s => s.PlatformCode)
                      .HasMaxLength(50);
            });

            // CachedPrediction configuration.
            modelBuilder.Entity<CachedPrediction>(entity =>
            {
                entity.ToTable("CachedPredictions");

                entity.HasKey(cp => cp.Id);

                entity.HasIndex(cp => new { cp.StationId, cp.RouteId, cp.DirectionId });

                entity.Property(cp => cp.RouteId)
                      .IsRequired()
                      .HasMaxLength(50);

                entity.Property(cp => cp.TripId)
                      .HasMaxLength(100);

                entity.Property(cp => cp.VehicleId)
                      .HasMaxLength(50);

                entity.Property(cp => cp.OccupancyStatus)
                      .HasMaxLength(50);

                entity.HasOne(cp => cp.Station)
                      .WithMany()
                      .HasForeignKey(cp => cp.StationId)
                      .OnDelete(DeleteBehavior.Cascade);
            });

            // UserCommute configuration.
            modelBuilder.Entity<UserCommute>(entity =>
            {
                entity.ToTable("UserCommutes");

                entity.HasKey(uc => uc.Id);

                entity.HasIndex(uc => uc.UserId);

                entity.Property(uc => uc.UserId)
                      .IsRequired()
                      .HasMaxLength(100);

                entity.Property(uc => uc.RouteId)
                      .IsRequired()
                      .HasMaxLength(50);

                entity.Property(uc => uc.ActiveDays)
                      .IsRequired()
                      .HasMaxLength(50);

                entity.HasOne(uc => uc.Station)
                      .WithMany()
                      .HasForeignKey(uc => uc.StationId)
                      .OnDelete(DeleteBehavior.Restrict);
            });

            // NotificationSubscription configuration.
            modelBuilder.Entity<NotificationSubscription>(entity =>
            {
                entity.ToTable("NotificationSubscriptions");

                entity.HasKey(ns => ns.Id);

                entity.HasIndex(ns => ns.UserId);

                entity.Property(ns => ns.UserId)
                      .IsRequired()
                      .HasMaxLength(100);

                entity.Property(ns => ns.SubscriptionType)
                      .IsRequired()
                      .HasMaxLength(20);

                entity.Property(ns => ns.EndpointOrToken)
                      .IsRequired()
                      .HasMaxLength(500);

                entity.Property(ns => ns.PublicKey)
                      .HasMaxLength(200);

                entity.Property(ns => ns.AuthSecret)
                      .HasMaxLength(200);
            });

            // UserLocationPreference configuration.
            modelBuilder.Entity<UserLocationPreference>(entity =>
            {
                entity.ToTable("UserLocationPreferences");

                entity.HasKey(ulp => ulp.Id);

                entity.HasIndex(ulp => ulp.UserId);

                entity.Property(ulp => ulp.UserId)
                      .IsRequired()
                      .HasMaxLength(100);

                entity.Property(ulp => ulp.Label)
                      .IsRequired()
                      .HasMaxLength(50);
            });

            // VehicleStatus configuration (optional).
            modelBuilder.Entity<VehicleStatus>(entity =>
            {
                entity.ToTable("VehicleStatuses");

                entity.HasKey(vs => vs.Id);

                entity.HasIndex(vs => vs.VehicleId);

                entity.Property(vs => vs.VehicleId)
                      .IsRequired()
                      .HasMaxLength(50);

                entity.Property(vs => vs.RouteId)
                      .IsRequired()
                      .HasMaxLength(50);

                entity.Property(vs => vs.CurrentStatus)
                      .HasMaxLength(50);

                entity.Property(vs => vs.OccupancyStatus)
                      .HasMaxLength(50);
            });
        }
    }
}