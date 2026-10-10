const money = (value) => `INR ${new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(Number(value || 0))}`

const dateTime = (value) => value ? new Date(value).toLocaleString() : 'Not recorded'

export const downloadInvoicePdf = async (bill) => {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 14
  const right = pageWidth - margin
  const columns = [margin, 25, 105, 122, 137, 159, 181, right]
  let y = 16

  const drawHeader = () => {
    pdf.setTextColor(23, 95, 73)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(18)
    pdf.text('Smart Inventory Management', margin, y)
    pdf.setFontSize(10)
    pdf.setTextColor(70, 88, 99)
    pdf.setFont('helvetica', 'normal')
    pdf.text('Retail invoice', margin, y + 6)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(16)
    pdf.setTextColor(29, 42, 53)
    pdf.text('INVOICE', right, y, { align: 'right' })
    pdf.setFontSize(10)
    pdf.text(String(bill.billNumber || 'Invoice'), right, y + 6, { align: 'right' })
    pdf.setDrawColor(23, 95, 73)
    pdf.setLineWidth(0.6)
    pdf.line(margin, y + 11, right, y + 11)
    y += 18
  }

  const drawTableHead = () => {
    const top = y
    pdf.setFillColor(239, 244, 241)
    pdf.rect(margin, top - 5, right - margin, 9, 'F')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(7.5)
    pdf.setTextColor(53, 70, 82)
    const headings = ['#', 'Item', 'Qty', 'Unit', 'Unit price', 'Discount', 'Line total']
    headings.forEach((heading, index) => {
      const align = index === 1 ? 'left' : index === 0 ? 'center' : 'right'
      const x = index === 1 ? columns[index] + 2 : columns[index + 1] - 2
      pdf.text(heading, x, top, { align })
    })
    y += 7
  }

  drawHeader()
  pdf.setFillColor(246, 248, 247)
  pdf.roundedRect(margin, y, right - margin, 28, 2, 2, 'F')
  pdf.setFontSize(9)
  pdf.setTextColor(41, 57, 68)
  pdf.setFont('helvetica', 'bold')
  pdf.text('Date:', margin + 4, y + 6)
  pdf.text('Cashier:', 109, y + 6)
  pdf.text('Customer:', margin + 4, y + 13)
  pdf.text('Contact:', 109, y + 13)
  pdf.text('Payment:', margin + 4, y + 20)
  pdf.text('Bill status:', 109, y + 20)
  pdf.setFont('helvetica', 'normal')
  pdf.text(dateTime(bill.createdAt), margin + 22, y + 6)
  pdf.text(String(bill.cashierName || bill.cashier?.name || 'Not recorded'), 128, y + 6, { maxWidth: 62 })
  pdf.text(String(bill.customerName || 'Walk-in Customer'), margin + 25, y + 13, { maxWidth: 68 })
  pdf.text(String(bill.customerPhone || '-'), 128, y + 13, { maxWidth: 62 })
  pdf.text(String(bill.paymentMethod || '-').toUpperCase(), margin + 22, y + 20)
  pdf.text(String(bill.status || 'Not recorded'), 128, y + 20)
  y += 37

  drawTableHead()
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  const items = Array.isArray(bill.items) ? bill.items : []
  items.forEach((item, index) => {
    const nameLines = pdf.splitTextToSize(String(item.name || 'Item'), columns[2] - columns[1] - 4)
    const offerLines = item.offerName ? pdf.splitTextToSize(String(item.offerName), columns[6] - columns[5] - 4) : []
    const rowHeight = Math.max(8, Math.max(nameLines.length, offerLines.length + 1) * 4 + 3)
    if (y + rowHeight > pageHeight - 23) {
      pdf.addPage()
      y = 16
      drawHeader()
      drawTableHead()
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8)
    }

    pdf.setDrawColor(224, 231, 235)
    pdf.line(margin, y + rowHeight - 1, right, y + rowHeight - 1)
    pdf.setTextColor(41, 57, 68)
    pdf.text(String(index + 1), columns[1] - 2, y + 4, { align: 'right' })
    pdf.text(nameLines, columns[1] + 2, y + 4)
    pdf.text(String(item.quantity ?? 0), columns[3] - 2, y + 4, { align: 'right' })
    pdf.text(String(item.unit || '-'), columns[4] - 2, y + 4, { align: 'right' })
    pdf.text(money(item.price), columns[5] - 2, y + 4, { align: 'right' })
    pdf.text(money(item.discountAmount), columns[6] - 2, y + 4, { align: 'right' })
    if (offerLines.length) {
      pdf.setFontSize(6.5)
      pdf.setTextColor(90, 107, 117)
      pdf.text(offerLines, columns[5] + 1, y + 7)
      pdf.setFontSize(8)
      pdf.setTextColor(41, 57, 68)
    }
    pdf.text(money(item.lineTotal), right - 2, y + 4, { align: 'right' })
    y += rowHeight
  })

  const totalsHeight = 56
  if (y + totalsHeight > pageHeight - 18) {
    pdf.addPage()
    y = 20
  } else {
    y += 7
  }
  const totalsX = 126
  pdf.setFontSize(9)
  pdf.setTextColor(41, 57, 68)
  pdf.setFont('helvetica', 'normal')
  pdf.text('Subtotal', totalsX, y)
  pdf.text(money(bill.subtotal), right, y, { align: 'right' })
  y += 6
  pdf.text('Discount', totalsX, y)
  pdf.text(money(bill.discount), right, y, { align: 'right' })
  y += 2
  pdf.setDrawColor(23, 95, 73)
  pdf.setLineWidth(0.5)
  pdf.line(totalsX, y, right, y)
  y += 7
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(12)
  pdf.text('Amount payable', totalsX, y)
  pdf.text(money(bill.total), right, y, { align: 'right' })
  y += 7
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.text('Amount paid', totalsX, y)
  pdf.text(money(bill.amountPaid), right, y, { align: 'right' })
  y += 6
  pdf.text('Change given', totalsX, y)
  pdf.text(money(bill.changeGiven), right, y, { align: 'right' })
  y += 13
  pdf.setDrawColor(224, 231, 235)
  pdf.line(margin, y, right, y)
  pdf.setFontSize(9)
  pdf.setTextColor(90, 107, 117)
  pdf.text('Thank you for shopping with us.', pageWidth / 2, y + 7, { align: 'center' })

  const filename = `Invoice-${String(bill.billNumber || 'bill').replace(/[^a-z0-9_-]/gi, '-')}.pdf`
  return pdf.save(filename, { returnPromise: true }).then(() => filename)
}
