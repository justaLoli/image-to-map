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

export const SidebarManager = {
    dropZone: document.getElementById("sidebar") as HTMLElement | null,
    loadbutton: document.getElementById("loadfile-button") as HTMLElement | null,

    init: function (onFileLoaded: (fileArray: File[]) => void) {
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

        this.setDescription("将旅行照片文件夹拖入到侧边栏，可以进行导入<br>也可以点击这个按钮进行导入")
    },

    setDescription: function (content: string) {
        const descriptionElement = document.getElementById("description");
        if (descriptionElement) descriptionElement.innerHTML = content;
    },

    addToList: function (element: HTMLElement) {
        const list = document.getElementById("marker-list");
        list?.appendChild(element);
    },
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
                // const fileArray = Array.from(input.files);
                // // App.main(fileArray);
                // onFileLoaded(fileArray);
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

