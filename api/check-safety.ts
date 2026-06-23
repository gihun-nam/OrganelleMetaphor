import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Type } from '@google/genai';

/**
 * Vercel Serverless Function: 학생 제출물(비유 제목/내용)의 안전성을 Gemini로 검사한다.
 * GEMINI_API_KEY는 Vercel 프로젝트의 환경변수(Settings > Environment Variables)로 주입된다.
 */

let aiInstance: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!aiInstance) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY environment variable is required and missing on the server config.');
    }
    aiInstance = new GoogleGenAI({ apiKey: key });
  }
  return aiInstance;
}

const MODEL = 'gemini-3.1-flash-lite';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  const { title, content } = req.body ?? {};

  if (!title || !content) {
    res.status(400).json({ error: 'Title and content fields are required.' });
    return;
  }

  try {
    const ai = getGeminiClient();

    const prompt = `당신은 대학 교양 생명과학 수업에서 학생 제출물을 확인하고 평가하는 생명과학 교수입니다.
아래 입력은 학생이 작성한 세포소기관 비유 활동의 제목과 내용입니다.
검토 대상은 오직 다음 두 항목입니다.
1. 비유 제목
2. 비유 내용
학생 이름, 학교명, 분반명, 평가 점수, 통계값, 다른 학생의 제출물, 전체 데이터셋은 제공되지 않으며, 판단에 사용해서도 안 됩니다.
다음 요소가 포함되어 있는지 확인하세요.
- 개인정보 또는 특정인 식별 가능 정보
- 실명, 연락처, 주소, 계정, 학번, 가족관계 등 민감하거나 식별 가능한 정보
- 특정 학생, 교수자, 조교, 수업 구성원, 가족, 지역 인물 등을 암시하는 표현
- 특정 개인이나 집단에 대한 비하, 혐오, 조롱, 모욕, 차별적 표현
- 성적 표현, 폭력적 표현, 자해 관련 표현
- 대학 교양 생명과학 수업 제출물로 부적절한 표현
단, 전체 맥락이 생명과학 개념 설명을 위한 일반적 비유라면 과도하게 검토 필요 처리하지 마세요.
위험도를 등급화하지 마세요.
판단 결과는 오직 needsReview 값으로만 구분하세요.
명확히 문제가 없으면 needsReview를 false로 반환하세요.
교수자가 확인해야 할 표현이 있으면 needsReview를 true로 반환하세요.
summary는 반드시 한 문장 이내로 짧게 작성하세요.
반드시 다음 JSON 형식만 반환하세요. JSON 이외의 설명은 절대 쓰지 마세요.
{
  "needsReview": boolean,
  "categories": string[],
  "flaggedSpans": [
    {
      "field": "title" | "content",
      "text": string,
      "reason": string
    }
  ],
  "summary": string
}
categories에는 다음 값 중 필요한 것만 넣으세요.
- "personal_info"
- "identifiable_person"
- "insult"
- "hate_or_discrimination"
- "sexual_content"
- "violent_content"
- "self_harm"
- "inappropriate_classroom_content"
- "other"
문제가 없으면 categories는 빈 배열 []로 반환하세요.
문제가 없으면 flaggedSpans도 빈 배열 []로 반환하세요.

검토할 입력:
title: ${title}
content: ${content}`;

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            needsReview: { type: Type.BOOLEAN },
            categories: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            flaggedSpans: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  field: { type: Type.STRING },
                  text: { type: Type.STRING },
                  reason: { type: Type.STRING },
                },
                required: ['field', 'text', 'reason'],
              },
            },
            summary: { type: Type.STRING },
          },
          required: ['needsReview', 'categories', 'flaggedSpans', 'summary'],
        },
      },
    });

    const text = response.text || '';
    const parsed = JSON.parse(text.trim());
    res.status(200).json(parsed);
  } catch (error: any) {
    console.error('[Gemini Server-Side Error]:', error);
    res.status(500).json({ error: error?.message || 'Gemini API call failed' });
  }
}
