// 1. 模块导入
import L, { marker } from 'leaflet';
import exifr from 'exifr';
import heic2any from "heic2any";

// 导入库和自定义的CSS文件，Vite会自动处理
import 'leaflet/dist/leaflet.css';
import './style.css';

// --- 解决 Leaflet 生产环境图标问题的代码 ---
// 1. 手动导入所有需要的图标资源
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

const myMarkerIcon = L.icon({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
    iconSize: [25, 41], // marker 大小
    iconAnchor: [12, 41], // marker 底部尖端的位置
    popupAnchor: [1, -34], // popup 弹出的位置
    shadowSize: [41, 41]  // 阴影大小
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
    thumbnail: string | null;
    marker?: L.Marker;
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
            preferCanvas: true,
            zoomSnap: 0.1,
            scrollWheelZoom: true
        }).setView([39.875272, 116.3914417], 13);
        this.map.invalidateSize();

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19,
        }).addTo(this.map);
        
        this.allMarkersGroup = L.featureGroup().addTo(this.map);
        this.rightClickZoom.init(this.map);

        // 实现macOS触控板缩放移动手势的妙妙小代码
        this.map.scrollWheelZoom.disable();
        this.map.getContainer().addEventListener('wheel', (e) => {
            e.preventDefault(); // 阻止默认缩放行为
            if(!this.map){return;}
            if (e.ctrlKey) {
                // 双指捏合手势（模拟 Ctrl + 滚轮）：缩放地图
                const delta = -e.deltaY; // 注意：负值表示放大，正值表示缩小
                const zoomDelta = delta > 0 ? 1 : -1;
                this.map.flyTo(
                    this.map.getCenter(),
                    this.map.getZoom() + zoomDelta * 0.3);
            } else {
                // 普通滚动（双指滑动）：平移地图
                this.map.panBy([e.deltaX, e.deltaY], {
                    animate: false
                });
            }
        }, { passive: false });


    },
    

    addMarker: function (marker: L.Marker<any>) {
        this.allMarkersGroup?.addLayer(marker);
    },

    viewAllMarker: function () {
        const bounds = this.allMarkersGroup?.getBounds();
        if (bounds && bounds.isValid()) {
            this.map?.fitBounds(bounds.pad(0.1));
        }
    }, 

    focusOnMarker: function (marker: L.Marker<any>) {
        if (!marker || !this.map) {
            console.warn(`no marker or no map`);
            return;
        }
        const latLng = marker.getLatLng();
        this.map.flyTo(latLng, 18, {
            animate: true,
        });
        marker.openPopup(); // 要放在激活flyTo后面。
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
                    App.main(fileArray);
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
            App.main(fileArray);
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


const App = {
    imageFiles: [] as ImageFileWithMeta[],
    generateThumbnailFromFile: async function (file: File): Promise<string> {
        function generateThumbnailFromBlob(blob: Blob, maxWidth = 200, maxHeight = 200): Promise<string> {
            return new Promise((resolve, reject) => {
                const url = URL.createObjectURL(blob);
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ratio = Math.min(maxWidth / img.width, maxHeight / img.height);
                    canvas.width = img.width * ratio;
                    canvas.height = img.height * ratio;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) return reject(new Error("Canvas not supported"));
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    URL.revokeObjectURL(url);
                    resolve(canvas.toDataURL("image/jpeg", 0.8));
                };
                img.onerror = reject;
                img.src = url;
            });
        }
        if (file.name.toLowerCase().endsWith(".heic")) {
            const convertedBlob = await heic2any({
                blob: file,
                toType: "image/jpeg",
                quality: 0.8
            }) as Blob;
            return await generateThumbnailFromBlob(convertedBlob);
        } else {
            return await generateThumbnailFromBlob(file);
        }
    },
    resetImageFiles: function () {
        this.imageFiles.length = 0;
        //TODO: 还需要在UI层面清理数据。
    },
    parseImageFiles: async function (fileArray: File[], progressCallback?: (count: number, total: number) => void) {
        const imageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/jpg'];
        const filteredFiles = fileArray.filter(file =>
            imageTypes.includes(file.type.toLowerCase()) || file.name.toLowerCase().endsWith('.heic')
        );

        const parseImageFile = async (file: File) => {
            let exifData: any = {}; // exifr 的返回类型比较复杂，这里用 any 简化
            try {
                exifData = await exifr.parse(file, { gps: true });
            } catch (e) {
                console.warn('EXIF read failed for:', file.name, e);
            }
            let thumbnail: string | null = null;
            try {
                thumbnail = await this.generateThumbnailFromFile(file);
            } catch (e) {
                console.warn(`缩略图生成失败`, file, e);
                thumbnail = null;
            }
            return {
                file,
                datetime: exifData?.DateTimeOriginal || new Date(file.lastModified),
                gps: (exifData?.latitude && exifData?.longitude) ? { lat: exifData.latitude, lng: exifData.longitude } : null,
                thumbnail: thumbnail
            };
        }
        let count: number = 0;
        // const imageFilesWithMeta: ImageFileWithMeta[] = await Promise.all(imageFiles.map(parseImageFile));
        for (const file of filteredFiles) {
            if (progressCallback) { progressCallback(count, filteredFiles.length); }
            await new Promise(requestAnimationFrame); // 或者 setTimeout(() => {}, 0)
            const t = await parseImageFile(file);
            this.imageFiles.push(t);
            count++;
        }

        this.imageFiles.sort((a, b) => a.datetime.getTime() - b.datetime.getTime());
    },
    createMarker: (img: ImageFileWithMeta, onclick?: any) => {
        const _createMarker = (lat: number, lng: number, popup: any) => {
            const marker = L.marker([lat, lng], { icon: myMarkerIcon });
            marker.bindPopup(popup);
            return marker;
        }
        const markerDescription = `时间：${formatDate(img.datetime)}<br>文件：${img.file.name}`;
        const marker = _createMarker(img.gps!.lat, img.gps!.lng, markerDescription);
        marker.addEventListener('click', onclick);
        return marker;
    },
    createListItemElement: (img: ImageFileWithMeta, onclick?: any) => {
        const listItemElement = document.createElement('div');
        listItemElement.className = "list-item";
        const listItemElementDescription = document.createElement('p');
        listItemElementDescription.className = "list-item-desc";
        listItemElementDescription.innerHTML = `时间：${formatDate(img.datetime)}<br>文件：${img.file.name}<br>位置信息：${img.gps ? "有" : "无"}`;
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
        listItemElement.onclick = onclick;
        listItemElementPreview.loading = "lazy";
        return listItemElement;
    },
    main: async function (fileArray: File[]): Promise<void> {

        this.resetImageFiles();
        await this.parseImageFiles(fileArray, (current, total) => {
            SidebarManager.setDescription(`正在解析并生成缩略图以优化后续操作<br>第${current}张照片，共${total}张...`)
        });
    
        SidebarManager.setDescription(`导入了 ${this.imageFiles.length} 张图片，其中 ${this.imageFiles.filter(i => i.gps).length} 张具备位置信息，已在图上标出`);


        this.imageFiles.filter(i => i.gps).forEach(img => {
            if (!img.gps) { return; }
            img.marker = this.createMarker(img, () => {
                console.log("marker被点击", marker, img);
            });
            MapManager.addMarker(img.marker);
        })

        this.imageFiles.filter(_ => 1).forEach(img => {
            const listItemElement = this.createListItemElement(img, () => {
                console.log("列表元素被点击：", img, img.marker);
                img.marker && MapManager.focusOnMarker(img.marker);
            });
            SidebarManager.addToList(listItemElement);
        });
    
        MapManager.viewAllMarker();
    }

}


// 5. 全局辅助函数和主逻辑 (TypeScript版)
function formatDate(date: Date): string {
    return date.toLocaleString('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(' ', ' ');
}



// 6. 启动应用
MapManager.init();
SidebarManager.init();