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



// 为包含元数据的文件对象定义接口
interface ImageFileWithMeta {
    file: File;
    datetime: Date;
    gps: { lat: number; lng: number } | null;
    thumbnail: string | null;
    marker?: L.Marker;
}


// 3. MapManager 对象 (TypeScript版)
import { MapManager } from './MapManager';

// 4. SidebarManager 对象 (TypeScript版)
import { SidebarManager } from './SidebarManager';

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
SidebarManager.init((array) => {App.main(array);});