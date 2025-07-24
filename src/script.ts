// 1. 模块导入
import exifr from 'exifr';
import heic2any from "heic2any";

// 导入库和自定义的CSS文件，Vite会自动处理
import 'leaflet/dist/leaflet.css';
import './style.css';


// 为包含元数据的文件对象定义接口
import { ImageFileWithMeta } from './types';


// 3. MapManager 对象 (TypeScript版)
import { MapManager } from './MapManager';

// 4. SidebarManager 对象 (TypeScript版)
import { SidebarManager } from './SidebarManager';

const App = {
    imageFiles: [] as ImageFileWithMeta[],

    resetImageFiles: function () {
        // this.imageFiles.length = 0;
        this.imageFiles.length = 0;
        MapManager.clearAllMarkers();
        SidebarManager.clearList();
    },

    main: async function (fileArray: File[]): Promise<void> {

        this.resetImageFiles();
        await this.parseImageFiles(fileArray, (current, total) => {
            SidebarManager.setDescription(`正在解析并生成缩略图以优化后续操作<br>第${current}张照片，共${total}张...`)
        });
    
        SidebarManager.setDescription(`导入了 ${this.imageFiles.length} 张图片，其中 ${this.imageFiles.filter(i => i.gps).length} 张具备位置信息，已在图上标出`);

        this.imageFiles.forEach(img => {
            MapManager.createMarker(img, () => {
                console.log("marker被点击", img);   
            })
            SidebarManager.createListItem(img, () => {
                console.log("列表元素被点击：", img);
                MapManager.focusOnMarker(img);
            });
        });
    
        MapManager.showMarkers(this.imageFiles);
        MapManager.fitAllMarkers();
        SidebarManager.showList(this.imageFiles);
    },
    parseImageFiles: async function (fileArray: File[], progressCallback?: (count: number, total: number) => void): Promise<void> {
        const imageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/jpg'];
        const filteredFiles = fileArray.filter(file =>
            imageTypes.includes(file.type.toLowerCase()) || file.name.toLowerCase().endsWith('.heic')
        );

        const parseImageFile = async (file: File): Promise<ImageFileWithMeta> => {
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
                id: file.webkitRelativePath || `${file.name}${file.lastModified}`,
                file: file,
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
}

// 6. 启动应用
MapManager.init();
SidebarManager.init({
    onFileLoaded: (fileArray) => App.main(fileArray),
    onChangeFilter: (filter) => { SidebarManager.showList(App.imageFiles.filter(filter)) },
    onSelectChange: (sel) => {console.log("select changed!", sel)}
});

