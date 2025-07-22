import L from 'leaflet';

export const MapManager = {
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