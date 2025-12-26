from PyPDF2 import PdfReader
from pathlib import Path
p = Path('assets/Shadab_Quant.pdf')
if not p.exists():
    raise SystemExit('PDF not found: '+str(p))
reader = PdfReader(str(p))
text_parts = []
for i,page in enumerate(reader.pages, start=1):
    t = page.extract_text() or ''
    text_parts.append(f'--- PAGE {i} ---\n'+t)
out = '\n\n'.join(text_parts)
Path('assets/resume_text.txt').write_text(out, encoding='utf-8')
print('Wrote assets/resume_text.txt, bytes:', len(out.encode('utf-8')))
