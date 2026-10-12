using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NextTrain.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddCommuteTransfer : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "TransferDirectionId",
                table: "UserCommutes",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "TransferMinutes",
                table: "UserCommutes",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TransferRouteId",
                table: "UserCommutes",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "TransferStationId",
                table: "UserCommutes",
                type: "int",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_UserCommutes_TransferStationId",
                table: "UserCommutes",
                column: "TransferStationId");

            migrationBuilder.AddForeignKey(
                name: "FK_UserCommutes_Stations_TransferStationId",
                table: "UserCommutes",
                column: "TransferStationId",
                principalTable: "Stations",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_UserCommutes_Stations_TransferStationId",
                table: "UserCommutes");

            migrationBuilder.DropIndex(
                name: "IX_UserCommutes_TransferStationId",
                table: "UserCommutes");

            migrationBuilder.DropColumn(
                name: "TransferDirectionId",
                table: "UserCommutes");

            migrationBuilder.DropColumn(
                name: "TransferMinutes",
                table: "UserCommutes");

            migrationBuilder.DropColumn(
                name: "TransferRouteId",
                table: "UserCommutes");

            migrationBuilder.DropColumn(
                name: "TransferStationId",
                table: "UserCommutes");
        }
    }
}
