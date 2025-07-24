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

export type SelectedIDs = Set<string>;

const createButton = (param: { 
	id: string, 
	innerHTML: string 
	onClick: (e: MouseEvent, button: HTMLButtonElement) => any, 
}) => {
	const GROUP_ID = "button-group-1";
	const { id, onClick, innerHTML } = param;
	const buttonGroup = document.getElementById(GROUP_ID)! as HTMLDivElement;
	const button = document.createElement("button");
	button.id = id;
	button.addEventListener("click", (e) => { onClick(e, button) })
	button.innerHTML = innerHTML;
	buttonGroup.appendChild(button);
}

export const SidebarManager = {
	dropZone: document.getElementById("sidebar") as HTMLElement | null,
	loadbutton: document.getElementById("loadfile-button") as HTMLElement | null,
	listItemsMap: new Map<string, HTMLDivElement>,

	selectControl: {
		isSelectMode: false,
		selectedElements: new Set<HTMLDivElement>(),
		externalOnSelectChange: null as null | ((selectedElements: SelectedIDs) => void),
		init(onSelectChange: (selectedElements: SelectedIDs) => void) {
			this.externalOnSelectChange = onSelectChange;
			createButton({
				id: "selecttoggle-button",
				innerHTML: "选择图片",
				onClick: (_, button) => { 
					this.changeSelectMode(!this.isSelectMode) 
					button.innerHTML = this.isSelectMode ? "取消选择" : "选择图片"
				}
			})
		},
		changeSelectMode(mode: boolean) {
			this.isSelectMode = mode;
			this.resetSelection();
		},
		resetSelection() { this.selectedElements.clear() },
		onSelect(element: HTMLDivElement) {
			if (!this.isSelectMode) { return; }
			// TODO: 增加样式变换。
			this.selectedElements.has(element)
				? this.selectedElements.delete(element)
				: this.selectedElements.add(element);
			if (!this.externalOnSelectChange) { return; }
			const selectedIDs = new Set<string>;
			this.selectedElements.forEach(item => {
				selectedIDs.add(item.dataset.id!);
			});
			this.externalOnSelectChange(selectedIDs);
		}
	},

	init: function (params: {
		onFileLoaded: (fileArray: File[]) => void,
		onChangeFilter: (filter: (img: ImageFileWithMeta) => boolean) => void,
		onSelectChange: (selectedElements: SelectedIDs) => void
	}) {
		const { onFileLoaded, onChangeFilter, onSelectChange } = params;
		if (!this.dropZone || !this.loadbutton) {
			console.error("Sidebar elements not found!");
			return;
		}

		this.loadbutton.addEventListener('click', () => {
			getFileArrayFromClick().then(onFileLoaded);
		});

		this.dropZone.addEventListener("drop", async (event: DragEvent) => {
			event.preventDefault();
			this.dropZone!.classList.remove("dragover");
			const fileArray = await getFileArrayFromDrag(event);
			onFileLoaded(fileArray);
		});

		this.dropZone.addEventListener("dragover", (event: DragEvent) => {
			event.preventDefault();
			this.dropZone!.classList.add("dragover");
		});

		this.dropZone.addEventListener("dragleave", () => {
			this.dropZone!.classList.remove("dragover");
		});

		this.setDescription("将旅行照片文件夹拖入到侧边栏，可以进行导入<br>也可以点击这个按钮进行导入");

		createButton({
			id: "shownogps-button",
			innerHTML: "只显示无位置信息",
			onClick: () => { onChangeFilter(img => !img.gps) }
		});
		createButton({
			id: "showall-button",
			innerHTML: "显示全部",
			onClick: () => { onChangeFilter(_ => true) }
		})

		this.selectControl.init(onSelectChange);
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
			!this.selectControl.isSelectMode && onClick();
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

