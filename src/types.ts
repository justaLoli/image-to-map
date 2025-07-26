export interface ImageFileWithMeta {
    id: string;
    file: File;
    datetime: Date;
    gps: { lat: number; lng: number } | null;
    thumbnail: string | null;
    isManualGps?: true
}

export function formatDate(date: Date): string {
    return date.toLocaleString('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(' ', ' ');
}

export const createButtonToButtonGroup = (param: { 
    id: string, 
    innerHTML: string 
    onClick: (e: MouseEvent, button: HTMLButtonElement) => any, 
    group_id: string
}) => {
    const { id, onClick, innerHTML, group_id } = param;
    const buttonGroup = document.getElementById(group_id)! as HTMLDivElement;
    const button = document.createElement("button");
    button.id = id;
    button.addEventListener("click", (e) => { onClick(e, button) })
    button.innerHTML = innerHTML;
    buttonGroup.appendChild(button);
}