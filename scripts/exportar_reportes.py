"""Exportador de la aplicación. Recibe solo una instantánea autorizada por Laravel.

PDF vectorial y XLSX con gráficos nativos vinculados a celdas editables.
No conecta con la base de datos ni acepta consultas o fórmulas del navegador.
"""
import argparse
import json
import math
import textwrap
import sys
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

COLORS = ['#285343', '#ad7726', '#5e8190', '#9b5550', '#819774', '#75628a', '#b69b67', '#66746e']


def crest_image(path):
    """Emblema a resolución de impresión para evitar incrustar varios MB."""
    if not path or not Path(path).is_file():
        return None
    from PIL import Image
    with Image.open(path) as original:
        emblem=original.convert('RGBA')
        emblem.thumbnail((120,160),Image.Resampling.LANCZOS)
        data=BytesIO()
        emblem.save(data,format='PNG',optimize=True)
    data.seek(0)
    return data,emblem.size


def fmt(value, kind='number', unit=''):
    if value is None:
        return 'Sin base' if kind == 'percent' or unit == '%' else 'No disponible'
    if isinstance(value, (int, float)):
        number = f'{value:,.1f}' if isinstance(value, float) and not value.is_integer() else f'{value:,.0f}'
        return number + (' %' if kind == 'percent' else (f' {unit}' if unit else ''))
    return str(value)


def metadata(payload):
    f = payload['filtros']
    return f"Período: {f.get('desde') or 'inicio del registro'} al {f.get('hasta') or 'último registro'}"


def excel(payload, output, crest):
    import xlsxwriter
    wb = xlsxwriter.Workbook(output, {'strings_to_formulas': False, 'strings_to_urls': False})
    wb.set_properties({'title': payload['reporte']['title'], 'author': 'Policía Boliviana', 'subject': payload['ambito']})
    main = wb.add_worksheet('Reporte')
    source = wb.add_worksheet('Datos gráficas')
    detail = wb.add_worksheet('Detalle')
    report = payload['reporte']
    styles = {
        'brand': wb.add_format({'font_name':'Arial','font_size':19,'bold':True,'font_color':'#285343','valign':'vcenter'}),
        'title': wb.add_format({'font_name':'Arial','font_size':15,'bold':True,'font_color':'#192d27','text_wrap':True,'valign':'vcenter'}),
        'note': wb.add_format({'font_name':'Arial','font_size':10,'font_color':'#53655b','text_wrap':True,'valign':'vcenter'}),
        'label': wb.add_format({'font_name':'Arial','font_size':10,'bold':True,'font_color':'#53655b','bg_color':'#f3f5f0','valign':'vcenter'}),
        'kpi': wb.add_format({'font_name':'Arial','font_size':23,'bold':True,'font_color':'#285343','bg_color':'#f3f5f0','num_format':'#,##0.0;[Red]-#,##0.0','valign':'vcenter'}),
        'text': wb.add_format({'font_name':'Arial','font_size':10,'font_color':'#192d27','valign':'top'}),
        'input': wb.add_format({'font_name':'Arial','font_size':10,'font_color':'#1755a1','num_format':'#,##0.0','valign':'top'}),
        'percent': wb.add_format({'font_name':'Arial','font_size':10,'font_color':'#1755a1','num_format':'0.0%','valign':'top'}),
    }
    for sheet in (main, source, detail):
        sheet.hide_gridlines(2)
        sheet.set_default_row(20)
        sheet.set_landscape()
        sheet.set_paper(1)
        sheet.fit_to_pages(1, 0)
        sheet.set_margins(.35,.35,.5,.5)
        sheet.set_footer('&LPolicía Boliviana&R&P / &N')
    main.set_column('A:L', 11)
    main.merge_range('A1:L2', 'POLICÍA BOLIVIANA', styles['brand'])
    emblem=crest_image(crest)
    if emblem:
        data,dimensions=emblem
        scale=39/dimensions[1]
        main.insert_image('K1','escudo.png',{'image_data':data,'x_scale':scale,'y_scale':scale,'x_offset':15,'object_position':1})
    main.merge_range('A3:L4', report['title'], styles['title'])
    main.merge_range('A5:L5', payload['ambito'], styles['note'])
    main.merge_range('A6:L6', metadata(payload), styles['note'])
    main.merge_range('A7:L7', f"Corte: {payload['generado_en']}", styles['note'])
    source.set_column('A:A', 45)
    source.set_column('B:F', 22)
    source.merge_range('A1:F1','Datos del reporte exportado',styles['title'])
    source.merge_range('A2:F2','Los valores en azul son editables en esta copia; no modifican los registros del sistema.',styles['note'])
    source.set_row(1,30)
    source.freeze_panes(3,1)
    for i, kpi in enumerate(report['kpis']):
        source.write_string(3+i,0,kpi['label'],styles['label'])
        if kpi['value'] is None:
            source.write_string(3+i,1,'Sin base',styles['text'])
        else:
            source.write_number(3+i,1,kpi['value'],styles['input'])
        source.write_string(3+i,2,kpi.get('unit',''),styles['text'])
        start=i*3
        main.merge_range(8,start,8,start+2,kpi['label'],styles['label'])
        main.merge_range(9,start,10,start+2,'',styles['kpi'])
        if kpi['value'] is None:
            main.write_string(9,start,'Sin base',styles['kpi'])
        else:
            suffix=(' "'+kpi['unit']+'"') if kpi.get('unit') else ''
            kformat=wb.add_format({'font_name':'Arial','font_size':23,'bold':True,'font_color':'#285343','bg_color':'#f3f5f0','num_format':'#,##0.0'+suffix,'valign':'vcenter'})
            main.write_formula(9,start,f"='Datos gráficas'!B{i+4}",kformat,kpi['value'])
    data_row=11
    chart_row=12
    for idx, spec in enumerate(report['charts']):
        source.merge_range(data_row,0,data_row,5,spec['title'],styles['title'])
        labels=spec['labels']
        header=data_row+1
        if labels:
            source.add_table(header,0,header+len(labels),len(spec['series']),{
                'name': f'Grafica_{idx+1}', 'style':'Table Style Medium 4',
                'columns':[{'header':'Categoría'}]+[{'header':s['name']} for s in spec['series']],
            })
            for row,label in enumerate(labels,header+1):
                source.write_string(row,0,str(label),styles['text'])
            for col,series in enumerate(spec['series'],1):
                for row,value in enumerate(series['values'],header+1):
                    source.write_number(row,col,float(value),styles['input'])
            kind={'stacked':'bar','bar':'bar','column':'column','line':'line','donut':'doughnut'}[spec['type']]
            options={'type':kind}
            if spec['type']=='stacked': options['subtype']='stacked'
            chart=wb.add_chart(options)
            for col,series in enumerate(spec['series'],1):
                settings={'name':['Datos gráficas',header,col], 'categories':['Datos gráficas',header+1,0,header+len(labels),0],
                    'values':['Datos gráficas',header+1,col,header+len(labels),col],
                    'line':{'color':series['color'],'width':2}, 'fill':{'color':series['color']}}
                if kind=='line': settings['marker']={'type':'circle','size':4}
                if kind=='doughnut': settings['points']=[{'fill':{'color':COLORS[i%len(COLORS)]}} for i in range(len(labels))]
                chart.add_series(settings)
            chart.set_title({'name':spec['title'],'name_font':{'name':'Arial','size':13,'color':'#192d27'}})
            chart.set_legend({'position':'bottom','font':{'name':'Arial','size':10}})
            chart.set_chartarea({'border':{'none':True},'fill':{'color':'#ffffff'}})
            chart.set_plotarea({'border':{'none':True}})
            chart.set_x_axis({'num_font':{'name':'Arial','size':9},'major_gridlines':{'visible':False}})
            chart.set_y_axis({'min':0,'num_font':{'name':'Arial','size':9},'major_gridlines':{'visible':True,'line':{'color':'#e2e8de'}}})
            chart.set_size({'width':900,'height':365})
            main.insert_chart(chart_row,0,chart,{'object_position':2})
        else:
            main.merge_range(chart_row,0,chart_row+2,11,f"{spec['title']}: sin registros en este período.",styles['note'])
        data_row+=len(labels)+5
        chart_row+=21
    for text in report['notes']:
        main.merge_range(chart_row,0,chart_row+1,11,text,styles['note'])
        chart_row+=3
    main.merge_range(chart_row,0,chart_row+2,11,'Las gráficas son objetos nativos de Excel: puedes cambiar su tipo, colores, títulos y series. Edita sus valores en Datos gráficas. Los indicadores representan el corte exportado.',styles['note'])
    main.print_area(0,0,chart_row+2,11)
    main.freeze_panes(8,0)
    detail.set_column('A:A',32)
    detail.set_column('B:H',24)
    detail.freeze_panes(3,1)
    row=0
    for index,tab in enumerate(report['tables']):
        n=max(2,len(tab['columns']))
        detail.merge_range(row,0,row,n-1,tab['title'],styles['title'])
        row+=2
        if not tab['rows']:
            detail.write_string(row,0,'Sin registros.',styles['note'])
            row+=3
            continue
        detail.add_table(row,0,row+len(tab['rows']),len(tab['columns'])-1,{'name':f'Detalle_{index+1}','style':'Table Style Medium 4','columns':[{'header':c['label']} for c in tab['columns']]})
        for offset,entry in enumerate(tab['rows'],1):
            for col,c in enumerate(tab['columns']):
                value=entry.get(c['key'])
                if value is None: detail.write_string(row+offset,col,'Sin base',styles['text'])
                elif c['format']=='percent': detail.write_number(row+offset,col,float(value)/100,styles['percent'])
                elif isinstance(value,(int,float)): detail.write_number(row+offset,col,value,styles['input'])
                else: detail.write_string(row+offset,col,str(value),styles['text'])
        row+=len(tab['rows'])+4
    detail.print_area(0,0,max(1,row),max(len(t['columns']) for t in report['tables'])-1)
    wb.close()


def pdf_chart(spec, width=540):
    from reportlab.graphics.shapes import Drawing, String, Line, Rect, Circle, PolyLine
    from reportlab.graphics.charts.piecharts import Pie
    from reportlab.lib.colors import HexColor, white
    labels=spec['labels']
    series=spec['series']
    if not labels or not any(any(v>0 for v in s['values']) for s in series):
        drawing=Drawing(width,70)
        drawing.add(String(12,35,'Sin registros para esta gráfica en el período.',fontName='Helvetica',fontSize=10,fillColor=HexColor('#53655b')))
        return drawing
    kind=spec['type']
    height=max(190,len(labels)*17+32) if kind in ('bar','stacked') else 190
    drawing=Drawing(width,height)
    if kind=='donut':
        values=series[0]['values']
        pie=Pie();pie.x=40;pie.y=27;pie.width=155;pie.height=155;pie.data=values;pie.labels=None
        pie.slices.strokeWidth=0
        for i in range(len(values)):pie.slices[i].fillColor=HexColor(COLORS[i%len(COLORS)])
        drawing.add(pie)
        drawing.add(Circle(117.5,104.5,47,fillColor=white,strokeColor=None))
        drawing.add(String(117.5,98,str(int(sum(values))),fontSize=23,fontName='Helvetica-Bold',textAnchor='middle',fillColor=HexColor('#285343')))
        for i,label in enumerate(labels):
            y=175-i*19
            drawing.add(Rect(240,y-2,7,7,fillColor=HexColor(COLORS[i%len(COLORS)]),strokeColor=None))
            drawing.add(String(253,y,str(label)[:38],fontSize=9,fontName='Helvetica',fillColor=HexColor('#192d27')))
            drawing.add(String(528,y,str(int(values[i])),fontSize=9,fontName='Helvetica-Bold',textAnchor='end'))
        return drawing
    legend_y=5
    for i,s in enumerate(series):
        x=i*(width/max(len(series),1))
        drawing.add(Rect(x,legend_y,7,7,fillColor=HexColor(s['color']),strokeColor=None))
        drawing.add(String(x+12,legend_y,s['name'],fontSize=8,fontName='Helvetica',fillColor=HexColor('#53655b')))
    if kind in ('bar','stacked'):
        left=182; usable=width-left-35
        maximum=max(sum(s['values'][i] for s in series) if kind=='stacked' else max(s['values'][i] for s in series) for i in range(len(labels))) or 1
        for i,label in enumerate(labels):
            y=height-24-i*17
            drawing.add(String(0,y+2,str(label)[:34],fontSize=8.5,fontName='Helvetica',fillColor=HexColor('#192d27')))
            x=left
            for s in series:
                value=s['values'][i];w=usable*value/maximum
                if w:drawing.add(Rect(x,y,w,10,fillColor=HexColor(s['color']),strokeColor=None))
                if kind=='stacked':x+=w
            total=sum(s['values'][i] for s in series)
            drawing.add(String(left+usable*(total/maximum)+4,y+1,fmt(total),fontSize=8,fontName='Helvetica-Bold'))
        return drawing
    left,bottom,plot_w,plot_h=40,53,width-60,130
    maximum=max(max(s['values']) for s in series) or 1
    for tick in range(4):
        y=bottom+plot_h*tick/3
        drawing.add(Line(left,y,left+plot_w,y,strokeColor=HexColor('#e0e6dd'),strokeWidth=.6))
        drawing.add(String(left-6,y-2,fmt(maximum*tick/3),fontSize=7.5,textAnchor='end',fillColor=HexColor('#53655b')))
    if kind=='line':
        for s in series:
            points=[]
            for i,value in enumerate(s['values']):
                x=left+(plot_w*i/(len(labels)-1) if len(labels)>1 else plot_w/2)
                y=bottom+plot_h*value/maximum
                points.extend([x,y]);drawing.add(Circle(x,y,2.3,fillColor=HexColor(s['color']),strokeColor=None))
            if len(labels)>1:drawing.add(PolyLine(points,strokeColor=HexColor(s['color']),strokeWidth=1.8))
        indices=sorted(set(list(range(0,len(labels),max(1,math.ceil(len(labels)/6))))+[len(labels)-1]))
        for i in indices:
            x=left+(plot_w*i/(len(labels)-1) if len(labels)>1 else plot_w/2)
            drawing.add(String(x,33,str(labels[i]),fontSize=7.5,textAnchor='middle',fillColor=HexColor('#53655b')))
    else:
        step=plot_w/max(1,len(labels));bar=min(42,step*.6/max(len(series),1))
        for i,label in enumerate(labels):
            for j,s in enumerate(series):
                x=left+step*i+step*.15+j*bar;value=s['values'][i]
                drawing.add(Rect(x,bottom,bar,plot_h*value/maximum,fillColor=HexColor(s['color']),strokeColor=None))
                drawing.add(String(x+bar/2,bottom+plot_h*value/maximum+5,fmt(value),fontSize=8,textAnchor='middle'))
            for line,text in enumerate(textwrap.wrap(str(label),16)[:2]):
                drawing.add(String(left+step*(i+.5),36-line*9,text,fontSize=7.5,textAnchor='middle',fillColor=HexColor('#53655b')))
    return drawing


def pdf(payload, output, crest):
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, LongTable, KeepTogether
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.utils import ImageReader
    styles=getSampleStyleSheet()
    styles['Heading3'].keepWithNext=True
    styles.add(ParagraphStyle('ReportTitle',fontName='Helvetica-Bold',fontSize=17,leading=21,textColor=colors.HexColor('#192d27'),spaceAfter=9))
    styles.add(ParagraphStyle('ReportText',fontName='Helvetica',fontSize=9,leading=13,textColor=colors.HexColor('#53655b'),spaceAfter=7))
    styles.add(ParagraphStyle('Cell',fontName='Helvetica',fontSize=8,leading=10,textColor=colors.HexColor('#192d27')))
    styles.add(ParagraphStyle('CellHeader',fontName='Helvetica-Bold',fontSize=8,leading=10,textColor=colors.white))
    def para(text,style='ReportText'):return Paragraph(escape(str(text)),styles[style])
    doc=SimpleDocTemplate(output,pagesize=letter,rightMargin=36,leftMargin=36,topMargin=91,bottomMargin=41,title=payload['reporte']['title'],author='Policía Boliviana')
    emblem=crest_image(crest)
    crest_reader=ImageReader(emblem[0]) if emblem else None
    def header(canvas,document):
        canvas.saveState()
        if crest_reader:canvas.drawImage(crest_reader,36,733,width=26,height=35,mask='auto',preserveAspectRatio=True)
        canvas.setFont('Helvetica-Bold',12);canvas.setFillColor(colors.HexColor('#285343'));canvas.drawString(73,755,'POLICÍA BOLIVIANA')
        canvas.setFont('Helvetica',8);canvas.setFillColor(colors.HexColor('#53655b'));canvas.drawString(73,741,payload['ambito'][:105])
        canvas.setStrokeColor(colors.HexColor('#dce5d8'));canvas.line(36,725,576,725)
        canvas.setFont('Helvetica',7);canvas.drawString(36,23,'Corte: '+payload['generado_en']);canvas.drawRightString(576,23,f'Página {document.page}')
        canvas.restoreState()
    report=payload['reporte']
    story=[para(report['title'],'ReportTitle'),para(report['description']),para(metadata(payload)),Spacer(1,6)]
    values=[[para(k['label'],'Cell') for k in report['kpis']],[para(fmt(k['value'],unit=k.get('unit','')),'ReportTitle') for k in report['kpis']]]
    kpis=Table(values,colWidths=[540/len(report['kpis'])]*len(report['kpis']))
    kpis.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),colors.HexColor('#f3f5f0')),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),9),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),5)]))
    story += [kpis,Spacer(1,17)]
    for chart in report['charts']:
        story.append(KeepTogether([para(chart['title'],'Heading3'),pdf_chart(chart),Spacer(1,8)]))
    for tab in report['tables']:
        story.append(para(tab['title'],'Heading3'))
        if not tab['rows']:
            story.append(para('Sin registros para el período seleccionado.'));continue
        count=len(tab['columns'])
        rows=[[para(c['label'],'CellHeader') for c in tab['columns']]]
        rows += [[para(fmt(row.get(c['key']),c['format']),'Cell') for c in tab['columns']] for row in tab['rows']]
        widths=[540/count]*count
        tbl=LongTable(rows,colWidths=widths,repeatRows=1,hAlign='LEFT')
        tbl.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#285343')),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#f3f5f0')]),('GRID',(0,0),(-1,-1),.35,colors.HexColor('#dce5d8')),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),5),('RIGHTPADDING',(0,0),(-1,-1),5),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)]))
        story += [tbl,Spacer(1,13)]
    story.append(para('Criterios de lectura','Heading3'))
    story += [para(note) for note in report['notes']]
    doc.build(story,onFirstPage=header,onLaterPages=header)


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--formato',choices=['pdf','xlsx'],required=True)
    parser.add_argument('--salida',required=True)
    parser.add_argument('--escudo',default='')
    args=parser.parse_args()
    payload=json.loads(sys.stdin.buffer.read().decode('utf-8'))
    (pdf if args.formato=='pdf' else excel)(payload,args.salida,args.escudo)
    print(json.dumps({'ok':True,'bytes':Path(args.salida).stat().st_size}))
