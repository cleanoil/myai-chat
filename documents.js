/* Text extraction stays on this device. Only extracted text is sent with a message. */
window.MyAIDocuments = (() => {
  const MAX_BYTES = 10 * 1024 * 1024;
  const MAX_TEXT = 60000;
  let pdfLibrary, wordLibrary, sheetLibrary;

  function loadSheets() {
    if (!sheetLibrary) sheetLibrary = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = './vendor/xlsx.full.min.js';
      script.onload = () => resolve(window.XLSX);
      script.onerror = () => { script.remove(); sheetLibrary = null; reject(new Error('Excel 解析组件加载失败，请联网后重试')); };
      document.head.appendChild(script);
    });
    return sheetLibrary;
  }

  async function extractSpreadsheet(buffer, extension) {
    const XLSX = await loadSheets();
    const magic = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 4));
    if (extension === 'xlsx' && !((magic[0] === 0x50 && magic[1] === 0x4b) || (magic[0] === 0xd0 && magic[1] === 0xcf))) throw new Error('文件不是有效的 .xlsx 表格，请在 Excel 中重新另存后上传');
    let input = buffer, type = 'array';
    if (extension === 'csv') {
      // UTF-8 (including BOM) and legacy Chinese Excel exports.
      try { input = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
      catch { input = new TextDecoder('gb18030').decode(buffer); }
      type = 'string';
    }
    let book;
    try { book = XLSX.read(input, { type, dense: true, raw: extension === 'csv', cellHTML: false, cellFormula: true, bookVBA: false }); }
    catch (error) {
      if (/password|encrypt/i.test(error.message)) throw new Error('表格已加密，请先移除密码再上传');
      throw new Error('表格无法读取，请确认文件完整，或在 Excel 中另存为 .xlsx 后重试');
    }
    if (!book.SheetNames.length) throw new Error('表格中没有工作表');
    if (book.SheetNames.length > 30) throw new Error('最多支持 30 个工作表，请拆分后上传');
    let text = '表格说明：以下包含各工作表的单元格显示文本。行以原始行号标记，单元格包含列字母；空单元格省略，合并单元格只保留左上角值。公式仅读取文件保存时的结果，不重新计算。图表、图片和宏不执行也不提取。\n';
    let populated = 0;
    function append(line) { text += line; if (text.length > MAX_TEXT) throw new Error('表格内容超过 6 万字符，请拆分或减少行列后上传'); }
    book.SheetNames.forEach((name, index) => {
      const sheet = book.Sheets[name];
      const hidden = book.Workbook?.Sheets?.[index]?.Hidden;
      append(`\n[工作表：${name}${hidden ? '（隐藏）' : ''}]\n`);
      const rows = sheet['!data'] || sheet;
      let count = 0;
      // Iterate stored cells rather than !ref: styled but empty sheets may have
      // a range spanning all 1,048,576 rows. Never allocate that rectangle.
      for (const rowKey of Object.keys(rows)) {
        if (!/^\d+$/.test(rowKey)) continue;
        const row = rows[rowKey], cells = [];
        for (const column of Object.keys(row)) {
          if (!/^\d+$/.test(column)) continue;
          const cell = row[column];
          if (!cell || cell.t === 'z') continue;
          let value;
          if (cell.v !== undefined && cell.v !== null) value = cell.w ?? XLSX.utils.format_cell(cell);
          else if (cell.f) value = `公式 =${cell.f}（无保存结果）`;
          else continue;
          if (String(value) === '') continue;
          cells.push(`${XLSX.utils.encode_col(Number(column))}: ${JSON.stringify(String(value))}`);
          count++; populated++;
          if (populated > 15000) throw new Error('表格非空单元格超过 15000 个，请拆分后上传');
        }
        if (cells.length) append(`第 ${Number(rowKey) + 1} 行 | ${cells.join(' | ')}\n`);
      }
      if (!count) append('（空工作表）\n');
    });
    if (!populated) throw new Error('表格中没有可分析的单元格内容');
    return text;
  }

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
    if (!['pdf', 'docx', 'xlsx', 'xls', 'csv'].includes(extension)) throw new Error('请选择 PDF、Word .docx、Excel .xlsx / .xls 或 CSV 文件');
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
    } else if (['xlsx', 'xls', 'csv'].includes(extension)) {
      text = await extractSpreadsheet(buffer, extension);
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
