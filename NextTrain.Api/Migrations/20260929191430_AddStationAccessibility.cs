using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NextTrain.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddStationAccessibility : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsAccessible",
                table: "Stations",
                type: "bit",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsAccessible",
                table: "Stations");
        }
    }
}
