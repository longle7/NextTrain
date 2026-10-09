using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NextTrain.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddBusRoutes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "BusRoutes",
                table: "Stations",
                type: "nvarchar(1000)",
                maxLength: 1000,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BusRoutes",
                table: "Stations");
        }
    }
}
