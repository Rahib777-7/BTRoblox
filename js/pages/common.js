"use strict"

const pageInit = {}
const startDate = new Date()

let loggedInUserPromise = null
let loggedInUser = -1
let isLoggedIn = false

const AssetTypeIds = [
	null,
	"Image", "TShirt", "Audio", "Mesh", "Lua", "HTML", "Text", "Hat", "Place", "Model", // 10
	"Shirt", "Pants", "Decal", "null", "null", "Avatar", "Head", "Face", "Gear", "null", // 20
	"Badge", "Group Emblem", "null", "Animation", "Arms", "Legs", "Torso", "RightArm", "LeftArm", "LeftLeg", // 30
	"RightLeg", "Package", "YouTubeVideo", "Game Pass", "App", "null", "Code", "Plugin", "SolidModel", "MeshPart", // 40
	"HairAccessory", "FaceAccessory", "NeckAccessory", "ShoulderAccessory", "FrontAccessory", "BackAccessory", "WaistAccessory", // 47
	"ClimbAnimation", "DeathAnimation", "FallAnimation", "IdleAnimation", "JumpAnimation", "RunAnimation", "SwimAnimation", "WalkAnimation", "PoseAnimation", // 56
	"EarAccessory", "EyeAccessory", "null", "null", // 60
	"EmoteAnimation"
]

const InvalidExplorableAssetTypeIds = [1, 3, 4, 5, 6, 7, 16, 21, 22, 32, 33, 34, 35, 37]
const InvalidDownloadableAssetTypeIds = [21, 32, 34]

const ContainerAssetTypeIds = {
	2: { filter: x => x.ClassName === "ShirtGraphic", prop: "Graphic" },
	11: { filter: x => x.ClassName === "Shirt", prop: "ShirtTemplate" },
	12: { filter: x => x.ClassName === "Pants", prop: "PantsTemplate" },
	13: { filter: x => x.ClassName === "Decal", prop: "Texture" },
	18: { filter: x => x.ClassName === "Decal", prop: "Texture" },
	40: { filter: x => x.ClassName === "MeshPart", prop: "MeshID" },
	61: { filter: x => x.ClassName === "Animation", prop: "AnimationId" }
}

const WearableAssetTypeIds = [2, 8, 11, 12, 17, 18, 27, 28, 29, 30, 31, 41, 42, 43, 44, 45, 46, 47]
const AnimationPreviewAssetTypeIds = [24, 48, 49, 50, 51, 52, 53, 54, 55, 56, 61]

const ProhibitedReasons = {
	UniverseDoesNotHaveARootPlace: "This game has no root place.",
	UniverseRootPlaceIsNotActive: "This game is not active",
	InsufficientPermissionFriendsOnly: "This game is friends only.",
	InsufficientPermissionGroupOnly: "Group members only.",
	UnderReview: "This game is under moderation review."
}

function getRobloxTimeZoneString() {
	const month = startDate.getUTCMonth() + 1
	const date = startDate.getUTCDate()
	const weekday = startDate.getUTCDay()
	const hour = startDate.getUTCHours()

	// DST starts on the second Sunday in March at 02:00 CST, which is 08:00 UTC
	// DST ends on the first Sunday in November at 01:00 CST, which is 07:00 UTC

	const someSunday = date + 7 - weekday
	const firstSunday = someSunday - Math.floor(someSunday / 7) * 7
	const secondSunday = firstSunday + 7

	if(
		(month > 3 && month < 11) || // Within daytime months
		(month === 3 && ( // Or march and DST has begun
			date > secondSunday ||
			(date === secondSunday && hour >= 8)
		)) ||
		(month === 11 && ( // Or november and DST has not ended
			date < firstSunday ||
			(date === firstSunday && hour < 7)
		))
	) {
		return "CDT"
	}

	return "CST"
}

function robloxTimeToDate(dateString) {
	return Date.parse(dateString) ? new Date(`${dateString} ${getRobloxTimeZoneString()}`) : false
}

const formatNumber = num => String(num).replace(/(\d\d*?)(?=(?:\d{3})+(?:\.|$))/yg, "$1,")
const formatUrlName = (name, def = "Name") => encodeURIComponent(name.replace(/[']/g, "").replace(/\W+/g, "-").replace(/^-+|-+$/g, "") || def)

let linkifyCounter = 0
const robloxLinkify = target => {
	const className = `btr-linkify-pls-${linkifyCounter++}`
	target.classList.add(className)
	InjectJS.send("linkify", className)
	target.classList.remove(className)
}

//


function startDownload(blob, fileName) {
	const link = document.createElement("a")
	link.setAttribute("download", fileName || "file")
	link.setAttribute("href", blob)
	document.body.append(link)
	link.click()
	link.remove()
}

function getAssetFileType(assetTypeId, buffer) {
	if(buffer instanceof ArrayBuffer) { buffer = new Uint8Array(buffer) }

	switch(assetTypeId) {
	case 1:
		if(buffer) {
			switch(buffer[0]) {
			case 0xFF: return "jpg"
			case 0x89: default: return "png"
			case 0x4D: return "tif"
			case 0x49: return "tif"
			case 0x47: return "gif"
			case 0x42: return "bmp"
			}
		}

		return "png"
	case 3:
		if(buffer) {
			const header = bufferToString(buffer.subarray(0, 4))
			switch(header) {
			case "RIFF": return "wav"
			case "OggS": return "ogg"
			default: return "mp3"
			}
		}
		
		return "mp3"
	case 4: return "mesh"
	case 9: return (buffer && buffer[7] !== 0x21) && "rbxlx" || "rbxl"
	default: return (buffer && buffer[7] !== 0x21) && "rbxmx" || "rbxm"
	}
}


function createPager(noSelect, hideWhenEmpty) {
	const pager = html`
	<div class=btr-pager-holder>
		<ul class=pager>
			<li class=pager-prev><a><span class=icon-left></span></a></li>
			<li class=pager-mid>
				Page <span class=pager-cur type=text value></span>
			</li>
			<li class=pager-next><a><span class=icon-right></span></a></li>
		</ul>
	</div>`

	if(!noSelect) {
		const mid = pager.$find(".pager-mid")
		mid.innerHTML = htmlstring`Page <input class=pager-cur type=text value> of <span class=pager-total></span>`
	}

	const prev = pager.$find(".pager-prev")
	const next = pager.$find(".pager-next")
	const cur = pager.$find(".pager-cur")

	Object.assign(pager, {
		curPage: 1,

		setPage(page) {
			this.curPage = page
			if(noSelect) {
				cur.textContent = page
				this.togglePrev(page > 1)
			} else {
				cur.value = page
				this.togglePrev(page > 1)
				this.toggleNext(page < this.maxPage)
			}
		},

		togglePrev(bool) { prev.classList.toggle("disabled", !bool) },
		toggleNext(bool) { next.classList.toggle("disabled", !bool) }
	})

	pager.setPage(1)

	prev.$find("a").$on("click", () => pager.onprevpage && pager.onprevpage())
	next.$find("a").$on("click", () => pager.onnextpage && pager.onnextpage())

	if(!noSelect) {
		const tot = pager.$find(".pager-total")
		pager.maxPage = 1

		Object.assign(pager, {
			onprevpage() { if(this.curPage > 1 && this.onsetpage) { this.onsetpage(this.curPage - 1) } },
			onnextpage() { if(this.curPage < this.maxPage && this.onsetpage) { this.onsetpage(this.curPage + 1) } },

			setMaxPage(maxPage) {
				this.maxPage = maxPage
				tot.textContent = maxPage

				if(hideWhenEmpty) {
					pager.style.display = maxPage < 2 ? "none" : ""
				}

				this.toggleNext(this.curPage < maxPage)
			}
		})

		pager.setMaxPage(1)

		cur.$on("keydown", e => {
			if(e.keyCode === 13 && pager.onsetpage) {
				let page = parseInt(cur.value, 10)
				if(Number.isNaN(page)) { return }

				page = Math.max(1, Math.min(pager.maxPage, page))

				if(pager.curPage !== page) {
					pager.onsetpage(page)
				} else {
					pager.setPage(page)
				}
			}
		})
	}

	return pager
}

const toggleSettingsModal = async force => {
	await loadOptionalLibrary("settingsModal")

	if(!document.body) { // Stuff breaks if body is not loaded
		await document.$watch(">body").$promise()
	}

	btrSettingsModal.toggle(force)
}

let reactListenerIndex = 0

const parseReactStringSelector = selector => {
	assert(!/[[>+~]/.exec(selector), "complex selectors not supported")
	const result = []
	
	for(const option of selector.split(/,/)) {
		let previous
		
		for(let piece of option.split(/\s+/)) {
			piece = piece.trim()
			if(!piece.length) { continue }
			
			const attributes = piece.split(/(?=[#.])/)
			const obj = {}
			
			for(const attr of attributes) {
				if(attr[0] === ".") {
					obj.classList = obj.classList ?? []
					obj.classList.push(attr.slice(1))
				} else if(attr[0] === "#") {
					obj.props = obj.props ?? {}
					obj.props.id = attr.slice(1)
				} else {
					if(attr !== "*") { // unset obj.type acts as universal selector
						obj.type = attr.toLowerCase()
					}
				}
			}
			
			if(previous) {
				previous.next = obj
			} else {
				result.push(obj) // Add first selector to result
			}
			
			previous = obj
		}
	}
	
	return result
}

const parseReactSelector = selectors => {
	selectors = Array.isArray(selectors) ? selectors : [selectors]
	const result = []
	
	for(let i = 0, len = selectors.length; i < len; i++) {
		const selector = selectors[i]
		
		if(typeof selector === "string") {
			result.push(...parseReactStringSelector(selector))
			continue
		}
		
		if(selector.selector) {
			assert(!selector.next)
			const selectors = parseReactStringSelector(selector)
			
			const fillMissingData = targets => {
				for(const target of targets) {
					if(target.next) {
						fillMissingData(target.next)
						continue
					}
					
					for(const key of selector) {
						if(key === "selector") { continue }
						const value = selector[key]
						
						if(Array.isArray(value)) {
							target[key] = target[key] ?? []
							target[key].push(...value)
						} else if(typeof value === "object") {
							target[key] = target[key] ?? {}
							for(const i in value) { target[key][i] = value[i] }
						} else {
							target[key] = value
						}
					}
				}
			}
			
			fillMissingData(selectors)
			result.push(...selectors)
			continue
		}
		
		result.push(selector)
	}
	
	return result
}

const reactInject = data => {
	data = { ...data }
	data.selector = parseReactSelector(data.selector)
	
	if(typeof data.index === "object") {
		data.index = { ...data.index }
		data.index.selector = parseReactSelector(data.index.selector)
	}
	
	const callback = data.callback
	const resultHtml = data.html
	
	delete data.callback
	delete data.html
	
	data.elemType = html(resultHtml).nodeName.toLowerCase()
	data.elemId = `btr-react-${reactListenerIndex++}`
	
	document.$watch(`#${data.elemId}`, node => {
		const replace = html(resultHtml)
		node.replaceWith(replace)
		callback?.(replace)
	}, { continuous: true })
	
	InjectJS.send("reactInject", data)
}



pageInit.common = () => {
	document.$on("click", ".btr-settings-toggle", toggleSettingsModal)
	
	reactInject({
		selector: "#settings-popover-menu",
		index: 0,
		html: `<li><a class="rbx-menu-item btr-settings-toggle">BTR Settings</a></li>`
	})

	try {
		const url = new URL(window.location.href)

		if(url.searchParams.get("btr_settings_open")) {
			sessionStorage.setItem("btr-settings-open", true)

			url.searchParams.delete("btr_settings_open")
			window.history.replaceState(null, null, url.toString())
		}
	} catch(ex) {}

	if(sessionStorage.getItem("btr-settings-open")) {
		try { toggleSettingsModal() }
		catch(ex) { console.error(ex) }
	}

	//

	const headWatcher = document.$watch(">head").$then()
	const bodyWatcher = document.$watch(">body", body => {
		body.classList.toggle("btr-no-hamburger", SETTINGS.get("navigation.noHamburger"))
		body.classList.toggle("btr-hide-ads", SETTINGS.get("general.hideAds"))

		if(currentPage) {
			body.dataset.btrPage = currentPage.name
		}
	}).$then()

	bodyWatcher.$watch("#roblox-linkify", linkify => {
		const index = linkify.dataset.regex.search(/\|[^|]*shoproblox\\.com/)
		
		if(index !== -1) {
			linkify.dataset.regex = linkify.dataset.regex.slice(0, index) + /|twitter\.com|youtube\.com|youtu\.be|twitch\.tv/.source + linkify.dataset.regex.slice(index)
			
			// Empty asHttpRegex matches everything, so every link will be unsecured, so fix that
			if(!linkify.dataset.asHttpRegex) { linkify.dataset.asHttpRegex = "^$" }
		} else {
			THROW_DEV_WARNING("linkify regex is not compatible")
		}
	})
	
	loggedInUserPromise = new SyncPromise(resolve => {
		headWatcher.$watch(`meta[name="user-data"]`, meta => {
			const userId = +meta.dataset.userid
			loggedInUser = Number.isSafeInteger(userId) ? userId : -1
			isLoggedIn = userId !== -1
			resolve(loggedInUser)
		})
		
		$.ready(() => resolve(-1))
	})
	
	if(SETTINGS.get("navigation.enabled")) {
		try { btrNavigation.init() }
		catch(ex) { console.error(ex) }
	}
	
	bodyWatcher.$watchAll("#buy-robux-popover", popover => {
		const bal = popover.$find("#nav-robux-balance")
		if(!bal) { return }

		const span = html`<span style="display:block;opacity:0.75;font-size:small;font-weight:500;"></span>`

		const update = () => {
			if(!RobuxToCash.isEnabled()) {
				span.remove()
				return
			}
			
			const matches = bal.textContent.trim().match(/^([\d,]+)\sRobux$/)
			if(!matches) { return }

			const amt = parseInt(matches[0].replace(/,/g, ""), 10)
			if(!Number.isSafeInteger(amt)) { return }

			span.textContent = RobuxToCash.convert(amt)
			bal.append(span)
		}

		const observer = new MutationObserver(update)
		observer.observe(bal, { childList: true })
		update()
		
		SETTINGS.onChange("general.robuxToUSDRate", update)
	})
	
	if(SETTINGS.get("general.fastSearch")) {
		try { btrFastSearch.init() }
		catch(ex) { console.error(ex) }
	}
	
	if(SETTINGS.get("general.hideAds")) {
		try { btrAdblock.init() }
		catch(ex) { console.error(ex) }
	}
	
	if(SETTINGS.get("general.hideChat")) {
		bodyWatcher.$watch("#chat-container", cont => cont.remove())
	} else {
		if(SETTINGS.get("general.smallChatButton")) {
			bodyWatcher.$watch("#chat-container", cont => cont.classList.add("btr-small-chat-button"))
		}
	}
}