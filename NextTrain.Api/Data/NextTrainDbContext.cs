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

        // DbSets = tables
        public DbSet<Station> Stations { get; set; } = null!;
        public DbSet<UserCommute> UserCommutes { get; set; } = null!;
        public DbSet<NotificationSubscription> NotificationSubscriptions { get; set; } = null!;
        public DbSet<UserLocationPreference> UserLocationPreferences { get; set; } = null!;

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
        }
    }
}