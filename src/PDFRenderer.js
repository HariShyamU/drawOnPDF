import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf';
import {fabric } from "./fabric"

function PDFRenderer({
  readOnly= false,
  pdfUrl= "https://file-examples-com.github.io/uploads/2017/10/file-sample_150kB.pdf",
  notes= {}
}) {
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loadedPDF, setLoadedPDF] = useState(null);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const fabricCanvas = useRef({
    canvas: null,
    zoomScale: 1,
    panning: false,
    lastX: null,
    lastY: null,
    pausePanning: false
  });
  const canvasContainer = useRef(null);
  const [data, setData] = useState(notes ? notes : {})
  pdfjs.GlobalWorkerOptions.workerSrc=`//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`

  const loadPDF = async (PDF_URL) => {
    const loadingTask = pdfjs.getDocument(PDF_URL);
    const pdf = await loadingTask.promise
    setLoadedPDF(pdf);
    return pdf
  }

  const renderPDF = async (PDF_URL) => {
    try {
      let pdf;
      if (loadedPDF === null) {
        pdf = await loadPDF(PDF_URL);
      } else {
        pdf = loadedPDF;
      }
      setTotalPages(pdf.numPages);
      const scale = 1.5;
      const currentPage = await pdf.getPage(page);
      const viewport = currentPage.getViewport({ scale: scale });

      const canvas = document.getElementById('pdfCanvas');

      // Prepare canvas using PDF page dimensions
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      // Render PDF page into canvas context
      const renderContext = { canvasContext: context, viewport: viewport };
      const renderTask = currentPage.render(renderContext);
      await renderTask.promise;
      
      // Set the rendered PDF as background image to FabricJS
      var bg = new Image();
      bg.src = data[page] ? data[page] : document.getElementById('pdfCanvas').toDataURL("image/png");
      if (fabricCanvas.current.canvas === null) {
        fabricCanvas.current.canvas = new fabric.Canvas('canvas', {
          width: canvasContainer.current.offsetWidth,
          height: (viewport.height/viewport.width)*canvasContainer.current.offsetWidth,
          selection: false
        })
      }

      fabric.Image.fromObject(bg, function(img) {
        fabricCanvas.current.canvas.setBackgroundImage(img,fabricCanvas.current.canvas.renderAll.bind(fabricCanvas.current.canvas), {
          scaleX: fabricCanvas.current.canvas.width/img.width,
          scaleY: fabricCanvas.current.canvas.height/img.height
        })
      })

      // Enable pinch zoom and pan
      fabricCanvas.current.canvas.on({
        'touch:gesture': function(e) {
          if (e.e.touches && e.e.touches.length === 2 && fabricCanvas.current.panning === false) {
            var point = new fabric.Point(e.self.x, e.self.y);
            let scale=1;
            if (e.self.scale > 1) scale = ((e.self.scale % 1)/10)+1;
            if (e.self.scale < 1) scale = 1-((1 - e.self.scale)/10);
            if (fabricCanvas.current.canvas.getZoom() * scale >= 1) {
              if (fabricCanvas.current.zoomScale !== scale) {
                fabricCanvas.current.zoomScale = scale;
                var delta = fabricCanvas.current.canvas.getZoom() * scale;
                fabricCanvas.current.canvas.zoomToPoint(point, delta);
              }
            } else {
              fabricCanvas.current.canvas.setViewportTransform([1,0,0,1,0,0]);
            }
          }
        }
      });
      fabricCanvas.current.canvas.on({
        'touch:drag': function(event) {
          var e = event.e;
          if (fabricCanvas.current.pausePanning === true || fabricCanvas.current.canvas.isDrawingMode === true || e.touches === undefined || e.touches[0].clientX === undefined || e.touches[0].clientY === undefined || e.touches.length === 2) {
            fabricCanvas.current.panning = false;
            return;
          }
          if (fabricCanvas.current.panning) {
            if (fabricCanvas.current.canvas.viewportTransform[4] + e.touches[0].clientX - fabricCanvas.current.lastX < ((fabricCanvas.current.canvas.getWidth() * fabricCanvas.current.canvas.getZoom()) - fabricCanvas.current.canvas.getWidth())/2) {
              fabricCanvas.current.canvas.viewportTransform[4] += e.touches[0].clientX - fabricCanvas.current.lastX;
              fabricCanvas.current.lastX = e.touches[0].clientX;
            }
            if (fabricCanvas.current.canvas.viewportTransform[5] + e.touches[0].clientY - fabricCanvas.current.lastY < ((fabricCanvas.current.canvas.getHeight() * fabricCanvas.current.canvas.getZoom()) - fabricCanvas.current.canvas.getHeight())/2) {
              fabricCanvas.current.canvas.viewportTransform[5] += e.touches[0].clientY - fabricCanvas.current.lastY;
              fabricCanvas.current.lastY = e.touches[0].clientY;
            }
            fabricCanvas.current.canvas.requestRenderAll();
          } else {
            fabricCanvas.current.panning = true;
            fabricCanvas.current.lastX = e.touches[0].clientX;
            fabricCanvas.current.lastY = e.touches[0].clientY;
          }
        }
      });
      fabricCanvas.current.canvas.on({
        "selection:created": function (e) {
          fabricCanvas.current.pausePanning = true;
        }
      });
      fabricCanvas.current.canvas.on({
        "selection:cleared": function (e) {
          fabricCanvas.current.pausePanning = false;
        }
      });
      fabricCanvas.current.canvas.on({
        "object:added": function (e) {
          var activeObject = e.target;
          if (activeObject.type === "path") {
            var lastItemIndex = (fabricCanvas.current.canvas.getObjects().length - 1);
            var item = fabricCanvas.current.canvas.item(lastItemIndex);
            item.selectable=false;
          }
        }
      });
    } catch (error) {
      console.error(error);
    }
  }

  const flipPage = (pageNumber) => {
    if (fabricCanvas.current.canvas.getObjects().length>0) {
      fabricCanvas.current.canvas.setViewportTransform([1,0,0,1,0,0]);
      setData({
        ...data,
        [page]: fabricCanvas.current.canvas.toDataURL({
          left: 0,
          top: 0,
          format: 'png',
          quality:1,
          multiplier: 5
        })
      })
    }
    clearAll();
    setPage(pageNumber)
  }

  const addText = (e) => {
    var pointer = fabricCanvas.current.canvas.getPointer(e.e);
    var posX = pointer.x;
    var posY = pointer.y;
    var text = new fabric.Text(document.getElementById('addTextInput').value, { left: posX, top: posY, textBackgroundColor: 'rgba(255,255,0,0.5)' });
    fabricCanvas.current.canvas.add(text);
    fabricCanvas.current.canvas.off("mouse:up", addText)
  }

  const addTextListener = () => {
    setIsDrawingMode(false)
    fabricCanvas.current.canvas.on("mouse:up", addText)
  }

  const undo = () => {
    var lastItemIndex = (fabricCanvas.current.canvas.getObjects().length - 1);
    var item = fabricCanvas.current.canvas.item(lastItemIndex);
    if(item !== undefined && (item.get('type') === 'path' || item.get('type') === 'text')) {
      fabricCanvas.current.canvas.remove(item);
      fabricCanvas.current.canvas.renderAll();
    }
  }

  const clearAll = () => {
    fabricCanvas.current.canvas.remove(...fabricCanvas.current.canvas.getObjects());
  }

  useEffect(() => {
    if (typeof pdfUrl === "string") {
      renderPDF(pdfUrl)
    }
    console.log(pdfUrl);
    // eslint-disable-next-line
  }, [page, pdfUrl])

  useEffect(() => {
    if (fabricCanvas.current.canvas) {
      fabricCanvas.current.canvas.isDrawingMode=isDrawingMode;
    }
  }, [isDrawingMode])


  return (
    <>
    <canvas id="pdfCanvas" style={{display:"none"}} />
    <div ref={canvasContainer} style={{position:'relative'}}>
      <canvas id="canvas" />
      <div style={{width:'100%', display:'flex', flexDirection:'column', alignItems:'center', position:"absolute", bottom:"0"}}>
        {
          readOnly === false && <>
            <div>
              <button onClick={() => {setIsDrawingMode(!isDrawingMode)}}>{isDrawingMode ? "Disable Drawing" : "Enable Drawing"}</button>
              <input id="addTextInput"/>
              <button onClick={() => {addTextListener()}}>Add text</button>
            </div>
            <div>
              <button onClick={() => {clearAll()}}>clear</button>
              <button onClick={() => {undo()}}>undo</button>
            </div>
          </>
        }
        <div>
          <button onClick={() => {page>1 && flipPage(page-1)}}>prev</button>
          <button onClick={() => {page<totalPages && flipPage(page+1)}}>next</button>
        </div>
      </div>
    </div>
    
    </>
  );
}

export default PDFRenderer;
