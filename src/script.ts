// 1. 模块导入
import exifr from 'exifr';
import heic2any from "heic2any";

// 导入库和自定义的CSS文件，Vite会自动处理
import 'leaflet/dist/leaflet.css';
import './style.css';


// 为包含元数据的文件对象定义接口
import { createButtonToButtonGroup, ImageFileWithMeta } from './types';


// 3. MapManager 对象 (TypeScript版)
import { MapManager } from './MapManager';

// 4. SidebarManager 对象 (TypeScript版)
import { SelectedIDs, SidebarManager } from './SidebarManager';
import { exportKML } from './exportkml';

const App = {
    imageFiles: [] as ImageFileWithMeta[],

    resetImageFiles: function () {
        // this.imageFiles.length = 0;
        this.imageFiles.length = 0;
        MapManager.clearAllMarkers();
        SidebarManager.clearList();
    },
    preferredZoomLevel: "fitall" as ("fitall" | "close"),
    onFileLoaded: async function (fileArray: File[]): Promise<void> {

        this.resetImageFiles();
        await this.parseImageFiles(fileArray, (current, total) => {
            SidebarManager.setDescription(`正在解析并生成缩略图以优化后续操作<br>第${current}张照片，共${total}张...`)
        });
    
        SidebarManager.setDescription(`导入了 ${this.imageFiles.length} 张图片，其中 ${this.imageFiles.filter(i => i.gps).length} 张具备位置信息，已在图上标出`);

        this.imageFiles.forEach(img => {
            MapManager.createMarker(img, (mode, img) => {
                this.onMarkerClick(mode, img);
            })
            SidebarManager.createListItem(img, (type, img) => {
                console.log("列表元素被点击：", img);
                if (type === "double") {
                    this.preferredZoomLevel = this.preferredZoomLevel == "fitall" 
                            ? "close" 
                            : "fitall";
                }
                let zoomLevel = 0;
                switch (this.preferredZoomLevel) {
                    case "fitall": zoomLevel = MapManager.getFitAllZoomLevel() ?? 16; break;
                    case "close": zoomLevel = 18; break;
                }
                MapManager.focusOnMarker(img, zoomLevel); 
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
    onMarkerClick(mode: "unset" | "viewinlist", img: ImageFileWithMeta) {
        console.log("marker被点击", img);
        switch (mode) {
            case "unset": break;
            case "viewinlist": SidebarManager.scrollToItem(img.id); break;
        }
    },
    commitLocationAssignment(ids: SelectedIDs, latlng: L.LatLng) {
        this.imageFiles.filter(i => ids.has(i.id)).forEach(img => {
            img.gps = latlng;
            img.isManualGps = true;
            MapManager.createMarker(img, this.onMarkerClick.bind(this));
        })
        SidebarManager.setDescription(`成功为${ids.size}个图片指定位置`)
        /* 添加marker到地图上。该方法不会重复添加，也不会移动视图 */
        MapManager.showMarkers(this.imageFiles);
        
        /* 清除Sidebar现有的选项 */
        SidebarManager.selectControl.resetSelection();
        
        /* MARK: 将Sidebar显示内容更新。难点在于无法按照filter更新。
         * 为了解决这个问题，将filter持久化存储在SidebarManager里作为一个属性方便调用。
         * 另一个难点在于找到listItem的ref并修改其内容，写了一段简短的hack */
        this.imageFiles.forEach(img => {
            const listItem = SidebarManager.listItemsMap.get(img.id);
            if (!listItem) return;
            const desc = listItem.querySelector('.list-item-desc');
            if (!desc) return;
            desc.innerHTML = desc.innerHTML.replace(
                /位置信息：[^\n<]*/,
                `位置信息：${img.gps ? '有' : '无'}`
            );
        })
        SidebarManager.showList(App.imageFiles.filter(SidebarManager.listFilter));

    }
}


/* 展开 / 折叠 侧边栏的按钮逻辑
 * 因为需要控制MapManager进行invalidateSize，所以狗皮膏药似的写在这里 */
document.addEventListener('DOMContentLoaded', () => {
    // 获取需要的DOM元素
    const allContainer = document.getElementById('all')! as HTMLDivElement; // 获取父容器
    const toggleBtn = document.getElementById('toggle-sidebar-btn')! as HTMLButtonElement;
    // 为按钮添加点击事件监听器
    toggleBtn.addEventListener('click', () => {
        // 在父容器上切换 'sidebar-collapsed' 类
        allContainer.classList.toggle('sidebar-collapsed');
        setTimeout(() => {
            MapManager.map!.invalidateSize();
        }, 350); /* 考虑动画延时，哈哈😅 */
        // 更新按钮的提示文字 (图标的翻转已由CSS的transform: rotate()处理)
        if (allContainer.classList.contains('sidebar-collapsed')) {
            toggleBtn.innerHTML = "➡️"
            toggleBtn.title = '展开侧边栏';
        } else {
            toggleBtn.innerHTML = "⬅️"
            toggleBtn.title = '折叠侧边栏';
        }
    });
});

/* 实验性功能：导出为Google Earth项目格式 */
createButtonToButtonGroup({
    id: "export-to-google-earth",
    innerHTML: "导出为Google Earth项目",
    onClick: () => { exportKML(App.imageFiles); },
    group_id: "experiment-button-group"
});




// 启动应用
MapManager.init();
SidebarManager.init({
    onFileLoaded: (fileArray) => { App.onFileLoaded(fileArray) },
    onChangeFilter: (filter) => { SidebarManager.showList(App.imageFiles.filter(filter)) },
    gpsAssign_onSelectChange: (sel) => {
        console.log("select changed!", sel);
        SidebarManager.setDescription(`选择了${sel.size}个图片`);
        /* 如果多选状态下，选择数归零，则关闭地图选点 */
        if (!sel.size) { MapManager.locationPicker.disable(); return; }
        MapManager.locationPicker.enable({
            onPickCallback: (ll) => {
                console.trace("选点完成", ll, sel);
                App.commitLocationAssignment(sel, ll);
            }
        })
    },
    onClear: () => { App.resetImageFiles() },
    onExport: () => {
        const content: Record<string, { lat: number; lng: number }> = {};

        App.imageFiles.filter(i => i.gps && i.isManualGps).forEach(img => {
            content[img.file.webkitRelativePath] = img.gps!;
        });

        const json = JSON.stringify(content, null, 2); // 美化缩进
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = "manual-gps.json";
        a.click();

        URL.revokeObjectURL(url);
    }

});
