let isProcessing = false;

async function solveQuestion(event) {
  try {
    if (isProcessing) {
      console.warn('يوجد طلب قيد المعالجة بالفعل');
      return;
    }
    isProcessing = true;

    await Word.run(async (context) => {
      const selection = context.document.getSelection();
      selection.load('text');
      await context.sync();

      const question = selection.text.trim();
      if (!question) {
        selection.insertParagraph('⚠️ لم يتم تحديد أي نص للسؤال.', Word.InsertLocation.after);
        await context.sync();
        return;
      }

      const placeholder = selection.insertParagraph('⏳ جارٍ إعداد الإجابة…', Word.InsertLocation.after);
      placeholder.font.color = '#999999';
      await context.sync();

      const response = await fetch('http://localhost:3000/api/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question })
      });

      const data = await response.json();

      if (response.ok && data.answer) {
        placeholder.delete();
        await context.sync();
        const answerPara = selection.insertParagraph(data.answer, Word.InsertLocation.after);
        answerPara.font.color = '#000000';
      } else {
        placeholder.delete();
        await context.sync();
        const errorMsg = data.error || 'حدث خطأ غير متوقع';
        selection.insertParagraph(`❌ ${errorMsg}`, Word.InsertLocation.after);
      }
      await context.sync();
    });
  } catch (error) {
    console.error('Word Add-in Error:', error);
    try {
      await Word.run(async (context) => {
        const selection = context.document.getSelection();
        selection.insertParagraph(`❌ خطأ داخلي: ${error.message}`, Word.InsertLocation.after);
        await context.sync();
      });
    } catch (e) {}
  } finally {
    isProcessing = false;
  }
}

Office.initialize = function (reason) {
  console.log('Office initialized successfully');
};

window.solveQuestion = solveQuestion;