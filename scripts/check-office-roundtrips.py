"""Generate representative Office fixtures, run Whitewash, and independently reopen copies.

Run with Python containing python-docx, python-pptx and openpyxl; Node 24 and
`npm ci` in website are needed. Generated files live only under .research/qa.
This checks document libraries and XML/package invariants, not Office rendering.
"""
import pathlib
import subprocess
import zipfile
import xml.etree.ElementTree as ET
from docx import Document
from docx.shared import Inches
from pptx import Presentation
from pptx.util import Inches as SlideInches
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font
from openpyxl.comments import Comment

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / '.research/qa/office-roundtrips'
OUT.mkdir(parents=True, exist_ok=True)
TEXT = 'We utilize customer feedback in order to improve.'
EXPECTED = 'We use customer feedback to improve.'

doc = Document()
doc.add_heading('Example report', 0)
p = doc.add_paragraph()
p.add_run('We utilize ').bold = True
p.add_run('customer feedback in order to improve.')
doc.add_table(rows=1, cols=1).cell(0, 0).text = TEXT
doc.sections[0].header.paragraphs[0].text = 'Header: utilize'
doc.core_properties.author = 'Synthetic Author'
doc.core_properties.title = 'Synthetic title'
doc.save(OUT / 'sample.docx')

deck = Presentation()
slide = deck.slides.add_slide(deck.slide_layouts[6])
box = slide.shapes.add_textbox(SlideInches(1), SlideInches(2), SlideInches(6), SlideInches(2))
p = box.text_frame.paragraphs[0]
p.add_run().text = 'We utilize '
p.runs[0].font.bold = True
p.add_run().text = 'customer feedback in order to improve.'
slide.notes_slide.notes_text_frame.text = 'Speaker notes: utilize'
deck.core_properties.author = 'Synthetic Author'
deck.save(OUT / 'sample.pptx')

book = Workbook()
sheet = book.active
sheet.title = 'Example'
sheet['A1'] = 'Do not utilize this label'
sheet['A2'] = TEXT
sheet['A2'].font = Font(bold=True)
sheet['A2'].comment = Comment('Retained comment', 'Synthetic Reviewer')
sheet['B2'] = 42
sheet['C2'] = '=SUM(B2:B9)'
sheet['B2'].number_format = '0.00'
sheet.merge_cells('D1:E1')
book.properties.creator = 'Synthetic Author'
book.save(OUT / 'sample.xlsx')

subprocess.run(['node', 'tests/office-roundtrip.mjs', str(OUT)], cwd=ROOT/'website', check=True)
edited_doc = Document(OUT / 'edited.docx')
assert edited_doc.paragraphs[1].text == EXPECTED
assert edited_doc.paragraphs[1].runs[0].bold is True
assert edited_doc.tables[0].cell(0, 0).text == EXPECTED
assert edited_doc.sections[0].header.paragraphs[0].text == 'Header: utilize'
edited_deck = Presentation(OUT / 'edited.pptx')
original_box = deck.slides[0].shapes[0]
edited_box = edited_deck.slides[0].shapes[0]
assert edited_box.text == EXPECTED
assert (edited_box.left, edited_box.top, edited_box.width, edited_box.height) == (original_box.left, original_box.top, original_box.width, original_box.height)
assert edited_box.text_frame.paragraphs[0].runs[0].font.bold is True
assert edited_deck.slides[0].notes_slide.notes_text_frame.text == 'Speaker notes: utilize'
edited_sheet = load_workbook(OUT / 'edited.xlsx').active
assert edited_sheet['A2'].value == EXPECTED and edited_sheet['A2'].font.bold is True
assert edited_sheet['A1'].value == 'Do not utilize this label'
assert edited_sheet['B2'].value == 42 and edited_sheet['B2'].number_format == '0.00'
assert edited_sheet['C2'].value == '=SUM(B2:B9)'
assert edited_sheet['A2'].comment.text == 'Retained comment'
assert list(edited_sheet.merged_cells.ranges) == list(sheet.merged_cells.ranges)

for extension, loader in [('docx', Document), ('pptx', Presentation), ('xlsx', load_workbook)]:
    loader(OUT / ('metadata.' + extension))
    with zipfile.ZipFile(OUT / ('sample.' + extension)) as before, zipfile.ZipFile(OUT / ('metadata.' + extension)) as after:
        assert before.namelist() == after.namelist()
        assert after.testzip() is None
        for part in before.namelist():
            if part not in ['docProps/core.xml', 'docProps/app.xml', 'docProps/custom.xml']:
                assert before.read(part) == after.read(part), part
            if part.endswith('.xml'):
                ET.fromstring(after.read(part))
        assert b'Synthetic Author' not in after.read('docProps/core.xml')
        assert all(info.date_time == (1980, 1, 1, 0, 0, 0) for info in after.infolist())
print('PASS: DOCX/PPTX/XLSX independently reopened; styles, tables, notes, formulas, comments and metadata copy checks passed.')
