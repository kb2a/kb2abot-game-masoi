const path = require("path");

const roles = loader.load(path.join(__dirname, "roles"));
const gameConfig = require("./gameConfig");
const {sendMessage} = kb2abot.helpers.fca;
const {asyncWait, random, shuffle} = kb2abot.helpers;
const lmao = ["ngủm", "chết", "tắt thở", "ra đi", "ngỏm củ tỏi", "bị bruh", "dead", "lmao", "về với ông bà", "lên thiên đàng"];

module.exports = class MasoiGame extends kb2abot.schemas.Game {
	constructor(options = {}) {
		super({
			...options,
			...{
				name: "Ma Sói"
			},
		});
		if (!this.isGroup) {
			throw new Error("Không thể tạo game masoi trong tin nhắn riêng tư!");
		}
		this.amount = parseInt(options.param);
		if (isNaN(this.amount)) {
			throw new Error("Vui lòng nhập đúng định dạng /game masoi <số lượng người chơi>");
		}
		if (!gameConfig.setup[this.amount])
			throw new Error("Không tìm thấy setup với số lượng người chơi " + this.amount);
		this.setup = gameConfig.setup[this.amount];
		this.state = new kb2abot.helpers.State([
			"settingUp",
			"done"
		]);
		this.playerManager = new kb2abot.helpers.Manager();
		this.history = [];
		this.forceEnd = false;
	}

	async clean() {
		await super.clean();
		this.forceEnd = true;
		for (const player of this.playerManager.items) {
			player.commit(null);
		}
	}

	// ---------------------------------------------------------------------------

	async onMessage(api, message) {
		if (!this.participants.includes(message.senderID) && this.state.is("done"))
			return;
		await super.onMessage(api, message);

		if (message.body.toLowerCase() == "end!") {
			if (message.senderID == this.masterID) {
				await kb2abot.gameManager.clean(this.threadID);
				await sendMessage(api, "Đã dọn dẹp trò chơi", this.threadID);
			}	else {
				await sendMessage(api, "Chỉ có chủ tạo game mới có thể end!", this.threadID);
			}
		}

		const curState = "state_" + this.state.getCurrent();
		if (this[curState].constructor.name == "AsyncFunction")
			await this[curState](api, message);
		else
			this[curState](api, message);
	}

	// ---------------------------------------------------------------------------

	// --> chat utilities
	chat_playerList(filter = {}) {
		let text = "";
		for (let index = 0; index < this.playerManager.getLength(); index++) {
			const player = this.playerManager.items[index];

			let pass = true;
			for (const key in filter) {
				if (player[key] !== filter[key]) {
					pass = false;
					break;
				}
			}

			if (pass)
				text += `${gameConfig.symbols[index+1]} ${player.name} (${player.username})`+
								`${player.died ? " - đã chết" : ""}\n`;
		}
		return text;
	}

	chat_des(type) {
		const roleData = gameConfig.data[type];
		return `BẠN LÀ ${type.toUpperCase()}!\n` +
					 `Chức năng: ${roleData.effect}\n` +
					 `Mô tả: ${roleData.description}\n` +
					 `Lưu ý: ${roleData.note}\n` +
					 `Lời khuyên: ${roleData.advice}`;
	}

	async chat_sendStatus(api) {
		await sendMessage(api, `Tình trạng:\n${this.chat_playerList()}`, this.threadID);
	}
	// <-- chat utilities

	// ---------------------------------------------------------------------------

	//  --> state function
	async state_settingUp(api, message) {
		if (message.body.toLowerCase() == "meplay" && this.participants.length < this.amount && this.u_addParticipant(message.senderID)) {
			await sendMessage(api, `${this.participants.length}/${this.amount}`, this.threadID);
			if (this.participants.length == this.amount) {
				const infos = await kb2abot.helpers.fca.getUserInfo(api, this.participants);
				shuffle(this.setup);
				for (let i = 0; i < this.participants.length; i++) {
					const participantID = this.participants[i];
					const info = infos[participantID];
					this.playerManager.add(new roles[this.setup[i]]({
						name: info.name || "(chưa kb)",
						username: kb2abot.helpers.fca.getUsername(info.profileUrl) || "(chưa kb)",
						threadID: participantID,
						gameID: this.id
					}));
				}
				const wws = this.playerManager.items.filter(e => e.type == "SoiThuong");
				let names = [];
				for (const ww of wws) {
					const {name, username} = ww;
					names.push(`${name}(${username})`);
				}
				for (const ww of wws) {
					const {name} = ww;
					await sendMessage(api, "Bạn ở phe /Sói/", ww.threadID);
					await sendMessage(api, `Những người cùng phe với bạn là: ${names.filter(n => n!=name).join(", ")}\n Hãy liên hệ với họ để có 1 teamwork tốt nhất nhé!`, ww.threadID);
				}
				let balanceScore = 0;
				for (const role of this.setup) {
					balanceScore += gameConfig.data[role].score;
				}
				await sendMessage(api, "Điểm cân bằng: " + balanceScore, this.threadID);
				await sendMessage(api, "Thứ tự gọi: " + gameConfig.arrange.filter(r => this.setup.includes(r)).join(" > "), this.threadID);
				await sendMessage(api, "Trò chơi bắt đầu sau 1 giây", this.threadID);
				await sendMessage(api, "Nhắn \"help\" để xem role của mình!", this.threadID);
				this.start(api, message);
				this.state.next();
			}
		}
	}

	state_done(api, message) {
		if (message.body != "end!") {
			const player = this.playerManager.find({threadID: message.senderID});
			switch(message.body) {
			case "help":
				api.sendMessage(this.chat_des(player.type), message.senderID);
				break;
			}
			if (!message.isGroup)
				this.playerManager.find({threadID: message.senderID}).onMessage(api, message);
		}
	}
	// <-- state function

	// ---------------------------------------------------------------------------

	// --> core
	async start(api) {
		const task = new kb2abot.helpers.State(["onNight", "onMorning", "onVote"]);
		while (!this.u_isEnd() && !this.forceEnd) {
			await this[task.getCurrent()](api);
			if (task.isEnd()) {
				task.reset();
			} else {
				task.next();
			}
		}
		await sendMessage(api, "Trò chơi kết thúc!", this.threadID);
		await sendMessage(api, `Phe /${this.u_getWinner(true)}/ đã giành chiến thắng!!`, this.threadID);
		await sendMessage(api, "Như chúng ta đã biết, vai trò của từng người là: . . .", this.threadID);
		for (const player of this.playerManager.items) {
			const {name, username, type} = player;
			await sendMessage(api, `${name}(${username}) - ${type}`, this.threadID);
			await asyncWait(1000);
		}
		await kb2abot.gameManager.clean(this.threadID);
		await sendMessage(api, "Đã dọn dẹp trò chơi!", this.threadID);
	}

	async onNight(api) {
		const historyPart = {
			time: "night",
			movements: []
		};
		this.history.push(historyPart);
		for (const type of gameConfig.arrange) {
			const groupPromise = [];
			const callPromiseQueueIndex = []; // thu tu call index player trong groupPromise
			for (let i = 0; i < this.playerManager.getLength(); i++) {
				const player = this.playerManager.items[i];
				if (player.type == type && !player.died) {
					callPromiseQueueIndex.push(i);
					groupPromise.push(player.onNight(api));
				}
			}
			if (groupPromise.length > 0) {
				const res = await Promise.all(groupPromise);
				for (let i = 0; i < callPromiseQueueIndex.length; i++) {
					const indexPlayer = callPromiseQueueIndex[i];
					const player = this.playerManager.items[indexPlayer];
					historyPart.movements.push({
						indexPlayer,
						type: player.type,
						data: res[i]
					});
				}
			}
		}
	}

	async onMorning(api) {
		const movements = this.history_last().movements;

		let
			iPlayerKilledByWolf = this.u_getIPlayerKilledByWolf(movements),
			iPlayerKilledByWitch = -1;

		if (iPlayerKilledByWolf != -1) {
			for (const movement of this.u_getMovements("BaoVe", movements)) {
				const commit = movement.data[0];
				if (commit.value == null)
					continue;
				if (commit.value - 1 == iPlayerKilledByWolf)
					iPlayerKilledByWolf = -1;
			}
		}

		for (const movement of this.u_getMovements("PhuThuy", movements)) {
			for (const commit of movement.data) {
				if (commit.value == null)
					continue;
				switch(commit.code) {
				case gameConfig.code.PHUTHUY_CUU:
					if (commit.value == "1")
						iPlayerKilledByWolf = -1;
					break;
				case gameConfig.code.PHUTHUY_GIET:
					iPlayerKilledByWitch = commit.value - 1;
					if (iPlayerKilledByWitch == iPlayerKilledByWolf)
						iPlayerKilledByWolf = -1;
					break;
				}
			}
		}

		// night end, starting morning
		for (const movement of movements) {
			const player = this.playerManager.items[movement.indexPlayer];
			for (const commit of movement.data) {
				await player.onNightEnd(api, commit.code, commit.value);
			}
		}
		await sendMessage(api, "Trời đã sáng!!", this.threadID);

		let deadAmount = 0;

		if (iPlayerKilledByWolf != -1) {
			deadAmount++;
			const player = this.playerManager.items[iPlayerKilledByWolf];
			const {name, username} = player;
			await sendMessage(api, `Người chơi ${name}(${username}) đã ${lmao[random(0, lmao.length-1)]} 💀`, this.threadID);
			await asyncWait(2000);
			await sendMessage(api, "*trên thi thể có rất nhiều vết cắn!", this.threadID);
			await asyncWait(2000);
			await player.die(api, "SoiThuong");
		}

		if (iPlayerKilledByWitch != -1) {
			deadAmount++;
			const player = this.playerManager.items[iPlayerKilledByWitch];
			const {name, username} = player;
			await sendMessage(
				api,
				`${(deadAmount>1?"PHÁT HIỆN THÊM n":"N")}gười chơi ${name}(${username}) đã ${lmao[random(0, lmao.length-1)]} 💀`,
				this.threadID
			);
			await asyncWait(2000);
			await player.die(api, "PhuThuy");
		}

		if (deadAmount > 0) {
			await sendMessage(api, `Vậy là đêm qua đã có ${gameConfig.symbols[deadAmount]} người chết!`, this.threadID);
			await this.chat_sendStatus(api);
		} else {
			await sendMessage(api, "Một đêm bình yên và không có chết chóc!", this.threadID);
			// await sendMessage(api, "Tuy là vậy nhưng chừng nào còn lũ sói, thì sẽ không có tự do!");
		}
	}

	async onVote(api) {
		await sendMessage(api, "30 giây bàn luận bắt đầu!", this.threadID);
		await asyncWait(gameConfig.timeout.DISCUSS);
		await sendMessage(api, "Các bạn có 30s để vote treo cổ", this.threadID);

		const groupPromises = [];
		for (const player of this.playerManager.items) {
			if (!player.died)
				groupPromises.push(player.voteKill(api));
		}
		const votes = await Promise.all(groupPromises);
		let hangedIndex = -1, max = -1;
		const dd = new Array(this.playerManager.getLength() + 1).fill(0);
		for (const commit of votes) {
			dd[commit.value]++;
			if (max < dd[commit.value]) {
				hangedIndex = commit.value - 1;
				max = dd[commit.value];
			}
		}

		const sorted = [...dd].sort((a,b) => b-a);
		if (sorted[0] == sorted[1]) {
			await sendMessage(api, "Sẽ không có ai bị treo cổ trong hôm nay (huề)", this.threadID);
		} else {
			const percent = max / this.playerManager.getLength() * 100;
			const player = this.playerManager.items[hangedIndex];
			const {name, username} = player;
			if (percent > 50) {
				await sendMessage(api, `Treo cổ ${name}(${username}) ...`, this.threadID);
				await asyncWait(2000);
				await player.die(api);
				await sendMessage(api, `${name}(${username}) đã ${lmao[random(0, lmao.length-1)]} 💀`, this.threadID);
				await asyncWait(1000);
				await this.chat_sendStatus(api);
			} else {
				const moment = dd[hangedIndex+1];
				const need = Math.round(votes.length/2) - moment;
				await sendMessage(api, `Không đủ số lượng vote cho ${name}(${username}) (hiện tại: ${moment}, cần thêm: ${need} phiếu!)`, this.threadID);
			}

		}
	}
	// <-- core

	// ---------------------------------------------------------------------------

	// --> game utilities

	u_getIPlayerKilledByWolf(movements) {
		let iPlayerKilledByWolf = -1;
		let max = -1;
		const dd = new Array(this.playerManager.getLength() + 1).fill(0);
		for (const movement of this.u_getMovements("SoiThuong", movements)) {
			const commit = movement.data[0];
			if (commit.value == null)
				continue;
			dd[commit.value]++;
			if (max < dd[commit.value]) {
				iPlayerKilledByWolf = commit.value - 1;
				max = dd[commit.value];
			}
		}
		const sorted = [...dd].sort((a,b) => b-a);
		if (sorted[0] == sorted[1])
			iPlayerKilledByWolf = -1;
		return iPlayerKilledByWolf;
	}

	u_getDeaths() {
		const out = [];
		for (const player of this.playerManager.items) {
			if (player.died)
				out.push(player);
		}
		return out;
	}

	u_getMovements(type, movements) {
		const out = [];
		for (const movement of movements) {
			if (this.playerManager.items[movement.indexPlayer].type == type)
				out.push(movement);
		}
		return out;
	}

	u_isEnd() {
		if (!this.u_getWinner())
			return false;
		return true;
	}

	u_getWinner(text = false) {
		let wwCount = 0;
		let danlangCount = 0;
		for (const player of this.playerManager.items) {
			const {party} = gameConfig.data[player.type];
			if (player.died) continue;
			if (party == -1)
				wwCount++;
			if (party == 1)
				danlangCount++;
		}
		if (danlangCount <= wwCount)
			return text ? "Sói" : -1;
		if (wwCount <= 0)
			return text ? "Dân Làng" : 1;
		return null;
	}

	u_addParticipant(id) {
		if (this.participants.includes(id))
			return false;
		this.participants.push(id);
		return true;
	}
	// <-- game utilities

	// ---------------------------------------------------------------------------

	// --> history
	history_addTime(time) {
		this.history.push({
			time,
			movements: []
		});
		return this.history_last();
	}
	history_addMovement(type, data) {
		this.history[this.history.length - 1].movements.push({
			type,
			data
		});
	}
	history_last() {
		return this.history[this.history.length - 1];
	}
	// <-- history
};
