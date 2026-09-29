using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NextTrain.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddStationRidership : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "AverageWeekdayBoardings",
                table: "Stations",
                type: "int",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AverageWeekdayBoardings",
                table: "Stations");
        }
    }
}
