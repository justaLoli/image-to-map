import L from 'leaflet';
import { createButtonToButtonGroup, formatDate, ImageFileWithMeta } from './types';

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

const createButton = (param: { 
    id: string, 
    innerHTML: string 
    onClick: (e: MouseEvent, button: HTMLButtonElement) => any, 
}) => createButtonToButtonGroup({ ...param, group_id: "map-control-button-group" })

class RightClickZoomControl {
    public enabled = false;
    private isRightMouseDown = false;
    private startLatLng = null as L.LatLng | null;
    private zoomBox = null as L.Rectangle | null;
    private map = null as L.Map | null;
    public init(map: L.Map) {
        this.map = map;
        map.on('contextmenu', (e: L.LeafletMouseEvent) => {
            e.originalEvent.preventDefault();
            if (!this.enabled) { return; }
            this.isRightMouseDown = true;
            this.startLatLng = e.latlng; // TS会提示latlng是正确的
                
            if (this.zoomBox) {
                map.removeLayer(this.zoomBox);
            }
            map.getContainer().style.cursor = 'crosshair';
        });

        map.on('mousemove', (e: L.LeafletMouseEvent) => {
            if (!this.enabled) { return; }
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
            if (!this.enabled) { return; }
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
    };
    private reset() {
        this.isRightMouseDown = false;
        this.startLatLng = null;
        if (this.zoomBox) { this.map!.removeLayer(this.zoomBox); }
        this.zoomBox = null;
    };
    public setEnabled(e: boolean) {
        this.enabled = e;
        this.reset();
    };
    public enable() { this.setEnabled(true); };
    public disable() { this.setEnabled(false); }
}

class TrackPadModeControl {
    public enabled = true;
    private map = null as L.Map | null;
    public init(map: L.Map) {
        this.map = map;
        // 实现macOS触控板缩放移动手势的妙妙小代码
        this.map.getContainer().addEventListener('wheel', (e) => {
            e.preventDefault(); // 阻止默认缩放行为
            if (!this.enabled) { 
                const delta = e.deltaY > 0 ? -0.5 : 0.5;
                const newZoom = map.getZoom() + delta;
                map.setZoomAround(map.mouseEventToContainerPoint(e), newZoom);
                return;
            }
            if (!this.map) { return; }
            if (e.ctrlKey) {
                // 双指捏合手势（模拟 Ctrl + 滚轮）：缩放地图
                const delta = -e.deltaY; // 注意：负值表示放大，正值表示缩小
                const zoomDelta = delta > 0 ? 1 : -1;
                const newZoom = this.map.getZoom() + zoomDelta * 0.3;
                this.map.flyTo(
                    this.map.getCenter(),
                    newZoom);
            } else {
                // 普通滚动（双指滑动）：平移地图
                this.map.panBy([e.deltaX, e.deltaY], {
                    animate: false
                });
            }
        }, { passive: false });
        this.refresh();
    }
    private refresh() {
        //核心逻辑利用回调函数中的判断进行开关，这里仅切换一个map的设置。
        this.enabled ? this.map!.scrollWheelZoom.disable() : this.map!.scrollWheelZoom.enable();
    }
    public setEanbled(e: boolean) {
        this.enabled = e;
        this.refresh();
    }
}

class LocationPicker {
    private map = null as null | L.Map;
    private originalCursor: string = '';
    private enabled = false;
    private virtualMarker: L.Marker | null = null;
    private moveHandler: ((e: L.LeafletMouseEvent) => void) | null = null;
    private onPickCallback: ((latlng: L.LatLng) => void) | null = null;
    public init(map: L.Map) {
        this.map = map;
        this.originalCursor = map.getContainer().style.cursor;
    }
    public enable(param: { onPickCallback: (latlng: L.LatLng) => void }) {
        // 如果重复调用enable，用新的callback替代旧的callback
        this.onPickCallback = param.onPickCallback;
        if (this.enabled) return;
        if (!this.map) return;
        this.enabled = true;
        // this.map.getContainer().style.cursor = `url(${myMarkerIcon.options.iconUrl}), auto`; /* 代修改透明度和中心位置 */
        this.map.getContainer().style.cursor = "crosshair";

        // 添加透明marker
        // this.virtualMarker = L.marker(this.map.getCenter(), {
        //     icon: myMarkerIcon,
        //     opacity: 0.5,
        //     interactive: false
        // }).addTo(this.map);
        // // 因为后续要注销这个函数，所以一定要把它的引用在哪里存一下
        // this.moveHandler = (e: L.LeafletMouseEvent) => {
        //     this.virtualMarker!.setLatLng(e.latlng);
        // }
        // this.map.on('mousemove', this.moveHandler);

        this.map.once('click', (e: L.LeafletMouseEvent) => {
            this.onPickCallback && this.onPickCallback(e.latlng);
            this.disable();
        })
    };
    public disable() {
        if (!this.enabled) return;
        if (!this.map) return;
        this.enabled = false;
        this.map.getContainer().style.cursor = this.originalCursor;
        this.onPickCallback = null;
        if (this.virtualMarker) {
            this.virtualMarker.remove();
            this.virtualMarker = null;
        }
        if (this.moveHandler) {
            this.map.off('mousemove', this.moveHandler);
            this.moveHandler = null;
        }
    };
}


export const MapManager = {
    map: null as L.Map | null,
    allMarkersGroup: null as L.FeatureGroup | null,
    markersMap: new Map<string, L.Marker>,
    rightClickZoom: new RightClickZoomControl,
    trackPadMode: new TrackPadModeControl,
    locationPicker: new LocationPicker,
    init() {
        // 使用 this 关键字指向当前对象，避免全局变量
        this.map = L.map('map', {
            preferCanvas: true,
            zoomSnap: 0.1,
            scrollWheelZoom: true,
            zoomControl: false
        }).setView([39.875272, 116.3914417], 13);
        this.map.invalidateSize();
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19,
        }).addTo(this.map);
        
        this.allMarkersGroup = L.featureGroup().addTo(this.map);
        this.rightClickZoom.init(this.map);
        this.trackPadMode.init(this.map);
        this.locationPicker.init(this.map);
        
        createButton({
            id: "fit-marker-button",
            innerHTML: "缩放到适合",
            onClick: () => { this.fitAllMarkers(); }
        });
        createButton({
            id: "rightclickzoom-toggle-button",
            innerHTML: "右键缩放：关",
            onClick: (_, b) => {
                const rcz = this.rightClickZoom;
                rcz.setEnabled(!rcz.enabled);
                b.innerHTML = `右键缩放：${rcz.enabled ? "开" : "关"}`
            }
        });
        createButton({
            id: "trackpadmode-toggle-button", 
            innerHTML: "触控板模式：开", 
            onClick: (_, b) => {
                const tpm = this.trackPadMode;
                tpm.setEanbled(!tpm.enabled)
                b.innerHTML = `触控板模式：${tpm.enabled ? "开" : "关"}`
            }
        });
    },
    
    createMarker(img: ImageFileWithMeta, onclick?: any): void {
        if (!img.gps) { return; }
        if (this.markersMap.has(img.id)) {
            const marker = this.markersMap.get(img.id)!;
            marker.setLatLng(img.gps);
            marker.off('click');
            onclick && marker.on('click', onclick);
            return;
        }
        const _createMarker = (latlng: typeof img.gps, popup: any) => {
            const marker = L.marker(latlng, { icon: myMarkerIcon });
            marker.bindPopup(popup);
            return marker;
        }
        const markerDescription = `时间：${formatDate(img.datetime)}<br>文件：${img.file.name}`;
        const marker = _createMarker(img.gps, markerDescription);
        onclick && marker.on('click', onclick);
        this.markersMap.set(img.id, marker);
    },

    showMarkers(imgs: ImageFileWithMeta[]) {
        imgs.forEach(img => {
            const marker = this.markersMap.get(img.id);
            /* addLayer自带去重 */
            marker && this.allMarkersGroup?.addLayer(marker);
        });
    },

    fitAllMarkers() {
        const bounds = this.allMarkersGroup?.getBounds();
        if (bounds && bounds.isValid()) {
            this.map?.fitBounds(bounds.pad(0.1));
        }
    }, 
    getFitAllZoomLevel() {
        const bounds = this.allMarkersGroup?.getBounds();
        if (bounds && bounds.isValid() && this.map){
            const zoom = this.map.getBoundsZoom(bounds);
            return zoom;
        }
        return null;
    },
    focusOnMarker(img: ImageFileWithMeta, zoomlevel = 18) {
        const marker = this.markersMap.get(img.id);
        if (!marker || !this.map) {
            console.warn(`no marker or no map`);
            return;
        }
        const latLng = marker.getLatLng();
        this.map.flyTo(latLng, zoomlevel, {
            animate: true,
        });
        marker.openPopup(); // 要放在激活flyTo后面。
    },

    clearAllMarkers() {
        this.allMarkersGroup?.clearLayers();
        this.markersMap.clear();
    }
};




