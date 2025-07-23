export interface ImageFileWithMeta {
    id: string;
    file: File;
    datetime: Date;
    gps: { lat: number; lng: number } | null;
    thumbnail: string | null;
}

export function formatDate(date: Date): string {
    return date.toLocaleString('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(' ', ' ');
}