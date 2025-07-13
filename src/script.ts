// 1. 模块导入
import L from 'leaflet';
import exifr from 'exifr';

// 导入库和自定义的CSS文件，Vite会自动处理
import 'leaflet/dist/leaflet.css';
import './style.css';

// --- 解决 Leaflet 生产环境图标问题的代码 ---
// 1. 手动导入所有需要的图标资源
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
// 2. 重写 L.Icon.Default 的默认选项
//    Vite 会将上面导入的图片路径替换为打包后的实际路径
Object.assign(L.Icon.Default.prototype.options, {
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
});

// 2. 为非标准API和复杂数据结构定义类型/接口
// 这会让你的代码获得完整的类型提示

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

// 为包含元数据的文件对象定义接口
interface ImageFileWithMeta {
    file: File;
    datetime: Date;
    gps: { lat: number; lng: number } | null;
}


// 3. MapManager 对象 (TypeScript版)
const MapManager = {
    map: null as L.Map | null,
    allMarkersGroup: null as L.FeatureGroup | null,

    rightClickZoom: {
        isRightMouseDown: false,
        startLatLng: null as L.LatLng | null,
        zoomBox: null as L.Rectangle | null,
        init: function (map: L.Map) {
            map.on('contextmenu', (e: L.LeafletMouseEvent) => {
                e.originalEvent.preventDefault();
                this.isRightMouseDown = true;
                this.startLatLng = e.latlng; // TS会提示latlng是正确的
                
                if (this.zoomBox) {
                    map.removeLayer(this.zoomBox);
                }
                map.getContainer().style.cursor = 'crosshair';
            });
            
            map.on('mousemove', (e: L.LeafletMouseEvent) => {
                if (!this.isRightMouseDown) return;
                
                const currentLatLng = e.latlng;
                
                if (!this.zoomBox) {
                    // this.startLatLng! 同样是非空断言
                    this.zoomBox = L.rectangle([this.startLatLng!, currentLatLng] as any, {
                        className: 'leaflet-zoom-box',
                        interactive: false
                    }).addTo(map);
                } else {
                    this.zoomBox.setBounds([this.startLatLng!, currentLatLng] as any);
                }
            });
            
            map.on('mouseup', () => {
                if (!this.isRightMouseDown) { return; }
                map.getContainer().style.cursor = '';
                this.isRightMouseDown = false;
                if (!this.zoomBox) { return; }
                const bounds = this.zoomBox.getBounds();
                map.removeLayer(this.zoomBox);
                this.zoomBox = null;

                if (bounds.isValid() && bounds.getSouthWest().distanceTo(bounds.getNorthEast()) > 100) {
                    map.fitBounds(bounds);
                }
            });
        },
    },

    init: function () {
        // 使用 this 关键字指向当前对象，避免全局变量
        this.map = L.map('map', {
            preferCanvas: true
        }).setView([39.875272, 116.3914417], 13);
        
        this.map.invalidateSize();
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19,
        }).addTo(this.map);
        
        this.allMarkersGroup = L.featureGroup().addTo(this.map);
        this.rightClickZoom.init(this.map);
    },
    

    addMarker: function (coord: { lat: number; lng: number }, popupContent: string | null = null) {
        const newMarker = L.marker([coord.lat, coord.lng]);
        if (popupContent) {
            newMarker.bindPopup(popupContent).openPopup();
        }
        this.allMarkersGroup?.addLayer(newMarker); // 使用可选链操作符更安全
    },

    viewAllMarker: function () {
        const bounds = this.allMarkersGroup?.getBounds();
        if (bounds && bounds.isValid()) {
            this.map?.fitBounds(bounds.pad(0.1));
        }
    }
};


// 4. SidebarManager 对象 (TypeScript版)
const SidebarManager = {
    dropZone: document.getElementById("sidebar") as HTMLElement | null,
    loadbutton: document.getElementById("loadfile-button") as HTMLElement | null,

    init: function () {
        if (!this.dropZone || !this.loadbutton) {
            console.error("Sidebar elements not found!");
            return;
        }

        this.loadbutton.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.multiple = true;
            // 'directory' 和 'webkitdirectory' 是非标准属性，需要特殊处理
            (input as any).directory = true;
            (input as any).webkitdirectory = true;

            input.addEventListener('change', () => {
                if (input.files) {
                    const fileArray = Array.from(input.files);
                    main(fileArray);
                }
            });
            input.click();
        });

        this.dropZone.addEventListener("drop", async (event: DragEvent) => {
            event.preventDefault();
            this.dropZone!.classList.remove("dragover");
            
            if (!event.dataTransfer) return;

            const fileArray: File[] = [];
            const items = event.dataTransfer.items;
            const tasks: Promise<void>[] = [];

            for (const item of items) {
                const entry = item.webkitGetAsEntry() as FileSystemEntry | null;
                if (entry) {
                    if (entry.isDirectory) {
                        tasks.push(this.handleDirectoryEntry(entry as FileSystemDirectoryEntry, entry.name + "/", fileArray));
                    } else if (entry.isFile) {
                        tasks.push(this.handleFileEntry(entry, "/", fileArray));
                    }
                }
            }
            await Promise.all(tasks);
            main(fileArray);
        });

        this.dropZone.addEventListener("dragover", (event: DragEvent) => {
            event.preventDefault();
            this.dropZone!.classList.add("dragover");
        });

        this.dropZone.addEventListener("dragleave", () => {
            this.dropZone!.classList.remove("dragover");
        });
    },

    // 文件夹拖放支持的辅助函数
    // 从旧项目复制过来的代码
    handleDirectoryEntry: async function (entry: FileSystemDirectoryEntry, rootPath: string, fileArray: File[]): Promise<void> {
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
                tasks.push(this.handleFileEntry(subEntry, rootPath, fileArray));
            } else if (subEntry.isDirectory) {
                tasks.push(this.handleDirectoryEntry(subEntry as FileSystemDirectoryEntry, rootPath + subEntry.name + "/", fileArray));
            }
        }
        await Promise.all(tasks);
    },
    handleFileEntry: function (entry: FileSystemEntry, _: string, fileArray: File[]): Promise<void> {
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


// 5. 全局辅助函数和主逻辑 (TypeScript版)
function formatDate(date: Date): string {
    return date.toLocaleString('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(' ', ' ');
}

async function main(fileArray: File[]): Promise<void> {
    const imageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/jpg'];
    const imageFiles = fileArray.filter(file =>
        imageTypes.includes(file.type.toLowerCase()) || file.name.toLowerCase().endsWith('.heic')
    );

    const imageFilesWithMeta: ImageFileWithMeta[] = await Promise.all(imageFiles.map(async (file) => {
        let exifData: any = {}; // exifr 的返回类型比较复杂，这里用 any 简化
        try {
            exifData = await exifr.parse(file, { gps: true });
        } catch (e) {
            console.warn('EXIF read failed for:', file.name, e);
        }

        return {
            file,
            datetime: exifData?.DateTimeOriginal || new Date(file.lastModified),
            gps: (exifData?.latitude && exifData?.longitude) ? { lat: exifData.latitude, lng: exifData.longitude } : null,
        };
    }));

    imageFilesWithMeta.sort((a, b) => a.datetime.getTime() - b.datetime.getTime());

    const imagesWithValidGPS = imageFilesWithMeta.filter(item => item.gps);
    
    SidebarManager.setDescription(`导入了 ${imageFilesWithMeta.length} 张图片，其中 ${imagesWithValidGPS.length} 张具备位置信息，已在图上标出`);

    imagesWithValidGPS.forEach(img => {
        if (!img.gps) return; // TS 类型保护
        const markerDescription = `时间：${formatDate(img.datetime)}<br>文件：${img.file.name}`;
        MapManager.addMarker(img.gps, markerDescription);
        
        const listItemElement = document.createElement('div');
        listItemElement.className = "list-item";
        const listItemElementDescription = document.createElement('p');
        listItemElementDescription.className = "list-item-desc";
        listItemElementDescription.innerHTML = `时间：${formatDate(img.datetime)}<br>文件：${img.file.name}`;
        const listItemElementPreview = document.createElement('img');
        listItemElementPreview.className = "list-item-img";
        listItemElement.appendChild(listItemElementDescription);
        listItemElement.appendChild(listItemElementPreview);
        const url = URL.createObjectURL(img.file);
        listItemElementPreview.src = url;
        listItemElementPreview.onload = () => {
            URL.revokeObjectURL(listItemElementPreview.src);
        }
        listItemElement.onclick = () => {
            console.log("clicked img", img);
        }
        // listItemElementPreview.loading = "lazy";
        SidebarManager.addToList(listItemElement);

    });
    
    MapManager.viewAllMarker();
}

// 6. 启动应用
MapManager.init();
SidebarManager.init();