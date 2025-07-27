import { formatDate, ImageFileWithMeta } from "./types";

// 为文件系统API创建简化的类型定义
interface FileSystemEntry {
	isFile: boolean;
	isDirectory: boolean;
	name: string;
	createReader(): FileSystemDirectoryReader;
	file(successCallback: (file: File) => void, errorCallback?: (error: Error) => void): void;
}

interface FileSystemDirectoryEntry extends FileSystemEntry {
	createReader(): FileSystemDirectoryReader;
}

interface FileSystemDirectoryReader {
	readEntries(successCallback: (entries: FileSystemEntry[]) => void, errorCallback?: (error: Error) => void): void;
}


const bindButton = (param: { 
	id?: string, 
	name?: string,
	onClick: (e: MouseEvent, button: HTMLButtonElement) => any, 
}): HTMLButtonElement | undefined => {
	const { id, name, onClick } = param;
	if (!id && !name) { console.error("wrong param in bindButton: no and and no name!"); return; }
	if (id && name) { console.warn("wrong param in bindButton: both id and name are given, please only give one :)"); }
	if (id) {
		const button = document.getElementById(id)! as HTMLButtonElement;
		button.addEventListener('click', (e) => onClick(e, button));
		return button;
	}
	const button = document.querySelector(`#sidebar button[name=${name}]`)! as HTMLButtonElement;
	button.addEventListener('click', (e) => onClick(e, button));
	return button
}


export type SelectedIDs = Set<string>;
class SelectControl {
	enabled = false;
	selectedElements = new Set<HTMLDivElement>();
	externalOnSelectChange = null as null | ((selectedElements: SelectedIDs) => void);
	init() {
	};
	setEnabled(mode: boolean, onSelectChange: (ele: SelectedIDs) => void) {
		this.enabled = mode;
		this.externalOnSelectChange = onSelectChange;
		this.resetSelection();
	};
	resetSelection() { 
		this.selectedElements.forEach(i => i.classList.remove("selected"));
		this.selectedElements.clear();
		this.externalOnSelectChange && this.externalOnSelectChange(new Set);
	};
	onSelect(element: HTMLDivElement) {
		if (!this.enabled) { return; }
		if (this.selectedElements.has(element)) {
			this.selectedElements.delete(element);
			element.classList.remove("selected");
		} else {
			this.selectedElements.add(element);
			element.classList.add("selected");
		}
		if (!this.externalOnSelectChange) { return; }
		const selectedIDs = new Set<string>;
		this.selectedElements.forEach(item => {
			selectedIDs.add(item.dataset.id!);
		});
		this.externalOnSelectChange(selectedIDs);
	}
};



export const SidebarManager = {
	dropZone: document.getElementById("sidebar") as HTMLElement | null,
	listItemsMap: new Map<string, HTMLDivElement>,

	selectControl: new SelectControl,
	listFilter: ((_) => true) as ((img: ImageFileWithMeta) => boolean),
	init: function (params: {
		onFileLoaded: (fileArray: File[]) => void,
		onChangeFilter: (filter: (img: ImageFileWithMeta) => boolean) => void,
		gpsAssign_onSelectChange: (selectedElements: SelectedIDs) => void,
		onClear: () => void,
		onExport: () => void
	}) {
		const { onFileLoaded, onChangeFilter, gpsAssign_onSelectChange, onClear, onExport } = params;
		if (!this.dropZone) {
			console.error("Sidebar not found!");
			return;
		}

		this.dropZone.addEventListener("drop", async (event: DragEvent) => {
			event.preventDefault();
			this.dropZone!.classList.remove("dragover");
			getFileArrayFromDrag(event).then(onFileLoaded);
		});

		this.dropZone.addEventListener("dragover", (event: DragEvent) => {
			event.preventDefault();
			this.dropZone!.classList.add("dragover");
		});

		this.dropZone.addEventListener("dragleave", () => {
			this.dropZone!.classList.remove("dragover");
		});

		this.setDescription("将旅行照片文件夹拖入到侧边栏，可以进行导入<br>也可以点击按钮进行导入");

		// bindButton({
		// 	id: "loadfile-button",
		// 	innerHTML: "导入图片",
		// 	onClick: () => { getFileArrayFromClick().then(onFileLoaded) }
		// });
		bindButton({
			name: "import-and-clear-button",
			onClick: (_, b) => {
				switch (b.innerHTML) {
					case "导入": 
						getFileArrayFromClick().then(list => { 
							b.innerHTML = "清除"; 
							onFileLoaded(list);
						}); 
						break;
					case "清除":
						onClear();
						b.innerHTML = "导入";
						break;
				}
			},
		});
		/* 过滤器 */
		const filterSelect = document.getElementById("filter-select")! as HTMLSelectElement;
		filterSelect.addEventListener('change', (_) => {
			console.log("选择", filterSelect.value);
			switch (filterSelect.value) {
				case "all": 
					this.listFilter = _ => true; 
					break;
				case "onlygps": 
					this.listFilter = img => !img.gps; 
					break;
			}
			onChangeFilter(this.listFilter); 
		});

		bindButton({
			name: "edit",
			onClick: (_, button) => {
				this.selectControl.setEnabled(!this.selectControl.enabled, gpsAssign_onSelectChange);
				if (this.selectControl.enabled) { SidebarManager.setDescription("开始位置指定模式"); } /* 从enable变换到了非enable */
				if (!this.selectControl.enabled) { SidebarManager.setDescription("位置指定模式已关闭");} /* 从enable变换到了非enable */
				button.innerHTML = this.selectControl.enabled
					? "退出编辑"
					: "编辑位置";
			}
		});

		bindButton({
			name: "export",
			onClick: onExport
		});
	},
	setDescription(content: string) {
		const descriptionElement = document.getElementById("description");
		if (descriptionElement) descriptionElement.innerHTML = content;
	},

	createListItem(img: ImageFileWithMeta, onClick?: any) {
		const listItemElement = document.createElement('div');
		/* 将数据的id写入DOM元素，方便反查 */
		listItemElement.dataset.id = img.id; 
		/* UI要素创建 */
		listItemElement.className = "list-item";
		const listItemElementDescription = document.createElement('p');
		listItemElementDescription.className = "list-item-desc";
		listItemElementDescription.innerHTML = `时间：${formatDate(img.datetime)}`
			+ `<br>文件：${img.file.name}`
			+ `<br>位置信息：${img.gps ? "有" : "无"}`;
		const listItemElementPreview = document.createElement('img');
		listItemElementPreview.className = "list-item-img";
		listItemElement.appendChild(listItemElementDescription);
		listItemElement.appendChild(listItemElementPreview);
		if (!img.thumbnail) {
			const url = URL.createObjectURL(img.file);
			listItemElementPreview.src = url;
			listItemElementPreview.onload = () => {
				URL.revokeObjectURL(listItemElementPreview.src);
			}
		} else {
			listItemElementPreview.src = img.thumbnail;
		}
		listItemElementPreview.loading = "lazy";
		/* 事件绑定 */
		// 外部可能需要hook的函数
		listItemElement.addEventListener("click", () => {
			!this.selectControl.enabled && onClick();
		});
		// 内部，处理多选逻辑的函数
		listItemElement.addEventListener("click", () => {
			this.selectControl.onSelect(listItemElement)
		});
		/* 创建（即加入到set）但不展示 */
		this.listItemsMap.set(img.id, listItemElement);
	},
	showList(imageArray: ImageFileWithMeta[]) {
		const list = document.getElementById("marker-list")!;
		list.innerHTML = "";
		imageArray.forEach((img) => {
			const item = this.listItemsMap.get(img.id);
			item && list.appendChild(item);
		});
	},
	clearList() {
		const list = document.getElementById("marker-list")!;
		list.innerHTML = '';
		this.listItemsMap.clear();
		this.setDescription("将旅行照片文件夹拖入到侧边栏，可以进行导入<br>也可以点击按钮进行导入")
	}
};


const getFileArrayFromClick = (): Promise<File[]> => {
	return new Promise((resolve, reject) => {
		const input = document.createElement('input');
		input.type = 'file';
		input.multiple = true;
		// 'directory' 和 'webkitdirectory' 是非标准属性，需要特殊处理
		(input as any).directory = true;
		(input as any).webkitdirectory = true;

		input.addEventListener('change', () => {
			if (input.files) {
				resolve(Array.from(input.files));
			} else {
				reject(new Error('no files selected'));
			}
		});
		input.click();
	})
}

const getFileArrayFromDrag = async (event: DragEvent) => {
	if (!event.dataTransfer) return [] as File[];
	const handleDirectoryEntry = async function (entry: FileSystemDirectoryEntry, rootPath: string, fileArray: File[]): Promise<void> {
		const reader = entry.createReader();
		const readEntries = (): Promise<FileSystemEntry[]> => {
			return new Promise((resolve, reject) => {
				reader.readEntries(resolve, reject);
			});
		};

		const entries = await readEntries();
		const tasks: Promise<void>[] = [];
		for (const subEntry of entries) {
			if (subEntry.isFile) {
				tasks.push(handleFileEntry(subEntry, rootPath, fileArray));
			} else if (subEntry.isDirectory) {
				tasks.push(handleDirectoryEntry(subEntry as FileSystemDirectoryEntry, rootPath + subEntry.name + "/", fileArray));
			}
		}
		await Promise.all(tasks);
	}
	const handleFileEntry = function (entry: FileSystemEntry, _: string, fileArray: File[]): Promise<void> {
		return new Promise((resolve, reject) => {
			entry.file(
				(file) => {
					if (!file.name.startsWith('.')) {
						fileArray.push(file);
					}
					resolve();
				},
				reject
			);
		});
	}

	const fileArray: File[] = [];
	const items = event.dataTransfer.items;
	const tasks: Promise<void>[] = [];

	for (const item of items) {
		const entry = item.webkitGetAsEntry() as FileSystemEntry | null;
		if (entry) {
			if (entry.isDirectory) {
				tasks.push(handleDirectoryEntry(entry as FileSystemDirectoryEntry, entry.name + "/", fileArray));
			} else if (entry.isFile) {
				tasks.push(handleFileEntry(entry, "/", fileArray));
			}
		}
	}
	await Promise.all(tasks);
	return fileArray;
}

