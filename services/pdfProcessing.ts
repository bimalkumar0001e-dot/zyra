import * as pdfjsLib from 'pdfjs-dist';

// Set up the worker source. In a Vite environment, we can import the worker script as a URL.
// We use the minified worker from the build folder.
// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export async function convertPdfToImages(file: File): Promise<string[]> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    
    // Load the PDF document
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    
    const numPages = pdf.numPages;
    const images: string[] = [];

    // Limit pages to avoid memory issues if PDF is huge, though user limited slides to 20 in App.tsx
    // We'll process up to 20 pages for consistency with the App's limit
    const maxPages = Math.min(numPages, 20);

    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      
      // extensive testing shows scale 1.5 is a good balance of quality and size
      // but users might want higher quality. Let's try 2.0
      const viewport = page.getViewport({ scale: 2.0 });
      
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      
      if (!context) {
        console.error('Canvas context not available');
        continue;
      }

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      await page.render(renderContext).promise;
      
      // Convert to base64 jpeg
      // .split(',')[1] removes the "data:image/jpeg;base64," prefix which App.tsx seems to expect based on blobToBase64 usage
      const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
      images.push(base64);
    }

    return images;
  } catch (error) {
    console.error('Error converting PDF to images:', error);
    throw error;
  }
}
