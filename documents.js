/* Text extraction stays on this device. Only extracted text is sent with a message. */
window.MyAIDocuments = (() => {
  const MAX_BYTES = 10 * 1024 * 1024;
  const MAX_TEXT = 60000;
  let pdfLibrary, wordLibrary;

  function loadWord() {
    if (!wordLibrary) wordLibrary = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = './vendor/mammoth.browser.min.js';
      script.onload = () => resolve(window.mammoth);
      script.onerror = () => { script.remove(); wordLibrary = null; reject(new Error('Word 解析组件加载失败，请联网后重试')); };
      document.head.appendChild(script);
    });
    return wordLibrary;
  }

  async function loadPDF() {
    if (!pdfLibrary) pdfLibrary = import('./vendor/pdf.mjs').catch(error => { pdfLibrary = null; throw error; });
    const pdf = await pdfLibrary;
    pdf.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.mjs', document.baseURI).href;
    return pdf;
  }

  async function extract(file) {
    const extension = file.name.split('.').pop().toLowerCase();
    if (extension === 'doc') throw new Error('旧版 .doc 请先在 Word 中另存为 .docx 或 PDF');
    if (!['pdf', 'docx'].includes(extension)) throw new Error('请选择 PDF 或 Word .docx 文档');
    if (!file.size) throw new Error('文件为空');
    if (file.size > MAX_BYTES) throw new Error('单个文档不能超过 10MB');
    const buffer = await file.arrayBuffer();
    let text = '', pages;
    if (extension === 'pdf') {
      const pdf = await loadPDF();
      const task = pdf.getDocument({
        data: new Uint8Array(buffer), isEvalSupported: false,
        cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/', cMapPacked: true,
        standardFontDataUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/standard_fonts/'
      });
      // Never leave a password dialog waiting inside the parser.
      task.onPassword = () => task.destroy();
      try {
        const doc = await task.promise;
        pages = doc.numPages;
        if (pages > 120) throw new Error('PDF 最多支持 120 页，请拆分后上传');
        for (let n = 1; n <= pages; n++) {
          const page = await doc.getPage(n);
          const content = await page.getTextContent();
          const pageText = content.items.map(item => (item.str || '') + (item.hasEOL ? '\n' : ' ')).join('');
          text += `\n[第 ${n} 页]\n${pageText}`;
          page.cleanup();
          if (text.length > MAX_TEXT) throw new Error('文档文字超过 6 万字，请拆分后上传');
        }
        if (!text.replace(/\[第 \d+ 页\]/g, '').trim()) throw new Error('PDF 未提取到文字，可能是扫描件，请先进行 OCR 文字识别');
      } catch (error) {
        if (/password|destroyed/i.test(error.message) || error.name === 'PasswordException') throw new Error('此 PDF 已加密，请先移除密码再上传');
        throw error;
      } finally {
        await task.destroy();
      }
    } else {
      const mammoth = await loadWord();
      const result = await mammoth.extractRawText({ arrayBuffer: buffer });
      text = result.value;
    }
    text = text.replace(/\u0000/g, '').trim();
    if (!text) throw new Error('文档未提取到文字，图片和扫描件需要先进行 OCR 文字识别');
    if (text.length > MAX_TEXT) throw new Error('文档文字超过 6 万字，请拆分后上传');
    return { name: file.name, text, ...(pages ? { pages } : {}) };
  }
  return { extract };
})();
