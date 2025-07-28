import { ImageFileWithMeta } from "./types";

export function exportKML(imageFiles: ImageFileWithMeta[]) {
  const placemarks = imageFiles
    .filter(img => img.gps)
    .map((img, idx) => {
      const { lat, lng } = img.gps!;
      const name = img.file.name;
      const thumbnail = img.thumbnail ? escapeXML(img.thumbnail) : '';
      return `
    <Placemark id="${idx + 1}">
      <name>${escapeXML(name)}</name>
      <styleUrl>#__managed_style_08D6EBBC053985C47831</styleUrl>
      <gx:Carousel>
        <gx:Image kml:id="embedded_image_${idx + 1}">
          <gx:imageUrl>${thumbnail}</gx:imageUrl>
        </gx:Image>
      </gx:Carousel>
      <Point>
        <coordinates>${lng},${lat},0</coordinates>
      </Point>
    </Placemark>`;
    })
    .join('\n');

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"
     xmlns:gx="http://www.google.com/kml/ext/2.2"
     xmlns:kml="http://www.opengis.net/kml/2.2"
     xmlns:atom="http://www.w3.org/2005/Atom">
<Document>
  <name>无标题项目</name>
  <gx:CascadingStyle kml:id="__managed_style_2F2566850D3985C47831">
    <styleUrl>https://earth.google.com/balloon_components/base/1.1.0.0/card_template.kml#main</styleUrl>
    <Style>
      <IconStyle>
        <scale>1.2</scale>
        <Icon>
          <href>https://earth.google.com/earth/document/icon?color=1976d2&amp;id=2000&amp;scale=4</href>
        </Icon>
        <hotSpot x="64" y="128" xunits="pixels" yunits="insetPixels"/>
      </IconStyle>
      <LabelStyle>
        <scale>0</scale>
      </LabelStyle>
      <LineStyle>
        <color>ff2dc0fb</color>
        <width>3.3</width>
      </LineStyle>
      <PolyStyle>
        <color>40ffffff</color>
      </PolyStyle>
      <BalloonStyle>
      </BalloonStyle>
    </Style>
  </gx:CascadingStyle>
  <gx:CascadingStyle kml:id="__managed_style_10A64EBC5C3985C47831">
    <styleUrl>https://earth.google.com/balloon_components/base/1.1.0.0/card_template.kml#main</styleUrl>
    <Style>
      <IconStyle>
        <Icon>
          <href>https://earth.google.com/earth/document/icon?color=1976d2&amp;id=2000&amp;scale=4</href>
        </Icon>
        <hotSpot x="64" y="128" xunits="pixels" yunits="insetPixels"/>
      </IconStyle>
      <LabelStyle>
        <scale>0</scale>
      </LabelStyle>
      <LineStyle>
        <color>ff2dc0fb</color>
        <width>2.2</width>
      </LineStyle>
      <PolyStyle>
        <color>40ffffff</color>
      </PolyStyle>
      <BalloonStyle>
      </BalloonStyle>
    </Style>
  </gx:CascadingStyle>
  <StyleMap id="__managed_style_08D6EBBC053985C47831">
    <Pair>
      <key>normal</key>
      <styleUrl>#__managed_style_10A64EBC5C3985C47831</styleUrl>
    </Pair>
    <Pair>
      <key>highlight</key>
      <styleUrl>#__managed_style_2F2566850D3985C47831</styleUrl>
    </Pair>
  </StyleMap>
  ${placemarks}
</Document>
</kml>`;

  const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'export.kml';
  a.click();
  URL.revokeObjectURL(url);
}

function escapeXML(str: string): string {
  return str.replace(/[<>&'"]/g, c => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '\'': '&apos;',
    '"': '&quot;',
  }[c] || c));
}
