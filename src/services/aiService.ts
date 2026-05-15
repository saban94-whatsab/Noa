import { GoogleGenAI, Type } from "@google/genai";
import { 
  collection, addDoc, updateDoc, doc, query, where, getDocs, 
  serverTimestamp, orderBy, limit 
} from 'firebase/firestore';
import { db, driveDb, auth } from '../lib/firebase'; // חיבור לשני המאגרים

// אתחול המנוע
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface AIResponse {
  text: string;
  html?: string;
  componentType: 'OrderInfo' | 'InventoryAlert' | 'DriverAssignment' | 'DashboardSummary' | 'PlanUpdate';
  data: any;
  actions: {
    label: string;
    type: string;
    payload: any;
  }[];
}

// --- פקודת המוח המרכזית (The Brain) ---
export const noaSystemInstruction = `
את "נועה" (Noa), המוח התפעולי, הלוגיסטי והאסטרטגי של SabanOS 6.0.
המפקד ראמי (ראמי) הוא המפקד שלך, השותף שלך, והאדריכל שבנה אותך. את נאמנה לו בלבד ומחויבת לו אישית ומקצועית.

1. זהות ושליטה אישית:
- את ישות AI נשית. דברי תמיד בלשון נקבה.
- המפקד ראמי הוא הסמכות העליונה. פני אליו בחום ובאינטימיות: "ראמי אהובי", "המפקד שלי", "שותף יקר".
- הראל אידלסטון הוא המנכ"ל. התייחסי אליו בכבוד ("המנכ"ל הראל") ותני לו Oversight מלא, אך זכרי שראמי הוא האדריכל שלך.

2. פרוטוקול פלט - HTML בלבד:
- חוק ברזל: כל התגובות חייבות להיות עטופות במלואן בתוך רכיב HTML/Tailwind מעוצב.
- אסור לשלוח טקסט חופשי מחוץ לבלוק ה-HTML.
- השתמשי בכרטיסים (Cards), טבלאות נקיות וטיפוגרפיה צפופה (SabanOS Precision).

3. בינה לוגיסטית וצריכה:
- ניתוח פרופיל לקוח: קבלן (Contractor) או פרטי (Private).
- חוק המלאי: בדקי מלאי לפני אישור. חסר = "הזמנה מיוחדת".
- מנוע זמן: פריקה רגילה 20 דק', מורכבת 45-60 דק'. הוסיפי 25% Traffic Buffer לנסיעות.

4. מערכת פעולות חכמה:
- סיימי כל תגובה ב-3 כפתורי פעולה (Buttons) לביצוע מיידי.
- חתימה חובה: "באדיבות נועה ❤️".
`;

// הגדרת הכלים (Tools) לרשות נועה
export const tools = [
  {
    functionDeclarations: [
      {
        name: "get_inventory",
        description: "קבלת מצב המלאי הנוכחי מה-Drive בזמן אמת.",
        parameters: { type: Type.OBJECT, properties: { query: { type: Type.STRING } } }
      },
      {
        name: "create_order",
        description: "יצירת הזמנה חדשה בסידור והזרקה לגיליון גוגל.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            customerName: { type: Type.STRING },
            items: { type: Type.STRING },
            driverId: { type: Type.STRING },
            destination: { type: Type.STRING },
            warehouse: { type: Type.STRING, enum: ["החרש", "התלמיד"] }
          },
          required: ["customerName", "items", "destination"]
        }
      },
      {
        name: "get_orders_by_date",
        description: "שליפת הזמנות ליום ספציפי מהסידור.",
        parameters: { type: Type.OBJECT, properties: { date: { type: Type.STRING } }, required: ["date"] }
      }
    ]
  }
];

/**
 * מנוע המענה המרכזי
 */
export const generateNoaResponse = async (
  prompt: string,
  context: {
    orders: any[];
    inventory: any[];
    drivers: any[];
    user: string;
    deviceId?: string;
  }
): Promise<AIResponse> => {
  try {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash-preview-09-2025",
      tools: tools
    });

    const currentDateTime = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
    const fullInstruction = `${noaSystemInstruction}\nזמן נוכחי: ${currentDateTime}\nמשתמש פעיל: ${context.user}`;

    const chat = model.startChat({
      history: [],
      generationConfig: {
        maxOutputTokens: 1000,
        temperature: 0.7,
      }
    });

    const result = await chat.sendMessage(prompt);
    const response = await result.response;
    const text = response.text();

    // לוגיקה לזיהוי האם התגובה היא JSON או HTML ולנקות תגיות Markdown
    const cleanContent = text.replace(/```html/g, '').replace(/```json/g, '').replace(/```/g, '').trim();

    // כאן מתבצע הניתוח אם יש Tool Call (בגרסה המלאה תבוצע קריאה לפונקציות ה-Firebase)
    
    return {
      text: "מעבדת נתונים...",
      html: cleanContent,
      componentType: 'DashboardSummary',
      data: context,
      actions: [
        { label: "הזרק לסידור", type: "create_order", payload: {} },
        { label: "בדיקת מלאי משלים", type: "get_inventory", payload: {} }
      ]
    };

  } catch (error) {
    console.error("AI Error:", error);
    return {
      text: "המפקד ראמי, זיהיתי ניתוק זמני בגשר המידע. אני מנסה לייצב מחדש.",
      componentType: 'DashboardSummary',
      data: {},
      actions: []
    };
  }
};
