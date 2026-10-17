using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NextTrain.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddCommuteTransferFrom : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "TransferFromStationId",
                table: "UserCommutes",
                type: "int",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_UserCommutes_TransferFromStationId",
                table: "UserCommutes",
                column: "TransferFromStationId");

            migrationBuilder.AddForeignKey(
                name: "FK_UserCommutes_Stations_TransferFromStationId",
                table: "UserCommutes",
                column: "TransferFromStationId",
                principalTable: "Stations",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_UserCommutes_Stations_TransferFromStationId",
                table: "UserCommutes");

            migrationBuilder.DropIndex(
                name: "IX_UserCommutes_TransferFromStationId",
                table: "UserCommutes");

            migrationBuilder.DropColumn(
                name: "TransferFromStationId",
                table: "UserCommutes");
        }
    }
}
