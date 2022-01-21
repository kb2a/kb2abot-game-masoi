import Ability from "./Ability"
import * as Format from "../format"

export default class Bite extends Ability {
	static question(player) {
		return (
			"Bạn muốn cắn ai trong danh sách 💀: \n" +
			player.world.game.listPlayer({died: false})
		)
	}

	static check(player, value) {
		const index = player.format(
			value,
			Format.validIndex,
			Format.alive,
			Format.notSelf
		)
		player.sendMessage(
			`Bạn đã chọn cắn chết ${player.world.players[index].name}!`
		)
		return index
	}

	// static async nightend(player, value, listDeaths) {}
}
