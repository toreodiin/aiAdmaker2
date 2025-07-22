function extractProductInfo(html) {
  if (!html) {
    return { title: '', description: '', price: '', images: [] };
  }

  const getMeta = (property) => {
    const regex = new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([\\s\\S]*?)["']`, 'i');
    const match = html.match(regex);
    return match ? match[1].trim() : '';
  };

  const title = getMeta('og:title') || (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1].trim() ?? '');

  const descBlockMatch = html.match(/<div[^>]+class=["']product-description[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  let description = descBlockMatch 
    ? descBlockMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
    : (getMeta('og:description') || '');

  description = description
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

  const price = getMeta('og:price:amount') || '';

  // ✅ SMART: Grab only <img> inside product gallery containers
  // Typical Shopify gallery container patterns: class includes 'product-gallery', 'product__media', 'product__images', etc.
  const galleryImgs = [];
  const galleryRegex = /<[^>]*(product-gallery|product__media|product__images)[^>]*>([\s\S]*?)<\/[^>]*>/gi;
  let galleryMatch;
  while ((galleryMatch = galleryRegex.exec(html)) !== null) {
    const galleryContent = galleryMatch[2];
    const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
    let imgMatch;
    while ((imgMatch = imgRegex.exec(galleryContent)) !== null) {
      galleryImgs.push(imgMatch[1]);
    }

    // Also pick up <a href="...jpg|png|webp"> inside gallery containers (for lightbox links)
    const aHrefRegex = /<a[^>]+href=["']([^"']+\.(jpg|png|webp))["']/gi;
    while ((imgMatch = aHrefRegex.exec(galleryContent)) !== null) {
      galleryImgs.push(imgMatch[1]);
    }
  }

  // Fallback: if no galleries matched, fallback to og:image
  if (galleryImgs.length === 0) {
    const ogRegex = /<meta[^>]+property=["']og:image(:secure_url)?["'][^>]+content=["']([^"']+)["']/gi;
    let match;
    while ((match = ogRegex.exec(html)) !== null) {
      galleryImgs.push(match[2]);
    }
  }

  // Clean and normalize
  const cleaned = galleryImgs.map(url => {
    let cleanUrl = url.trim();
    cleanUrl = cleanUrl.replace(/^\/\//, 'https://');
    cleanUrl = cleanUrl.split('?')[0];
    return cleanUrl;
  });

  const unique = [...new Set(cleaned)];

  console.log('Raw gallery images:', galleryImgs);
  console.log('Unique cleaned:', unique);

  return {
    title,
    description,
    price,
    images: unique
  };
}

module.exports = { extractProductInfo };