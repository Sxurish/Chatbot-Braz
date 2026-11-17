import type { CourtPublication, PublicationAiReading } from "./types";

/**
 * Intimações fictícias do modo demonstração (sem Supabase). Com o Supabase
 * ligado nada daqui aparece. Variadas de propósito: uma ligada ao processo,
 * uma sem processo no CRM, uma com dúvida da IA, uma confirmada e uma
 * descartada.
 */

const PROC = "proc-001";
const PROC_DIGITS = "10023456720268260554";
const PROC_MASKED = "1002345-67.2026.8.26.0554";
const LINK = "https://comunica.pje.jus.br/consulta";

const LAWYER = { name: "JEAN BRAZ", oab: "459159", uf: "SP" };

function reading(r: Partial<PublicationAiReading> & Pick<PublicationAiReading, "actType" | "summary">): PublicationAiReading {
  return {
    requiresAction: true,
    suggestedDays: null,
    suggestedUnit: null,
    startKind: "disponibilizacao",
    dobro: false,
    taskTitle: null,
    legalBasis: null,
    quote: null,
    uncertain: [],
    confidence: "alta",
    ...r,
  };
}

function pub(p: Partial<CourtPublication> & Pick<CourtPublication, "id" | "available_date" | "text">): CourtPublication {
  const captured = `${p.available_date}T13:10:00Z`;
  return {
    source: "djen",
    external_key: `id:${p.id.replace(/\D/g, "")}48213`,
    external_id: `${p.id.replace(/\D/g, "")}48213`,
    hash: null,
    publication_date: null,
    tribunal: "TJSP",
    organ: "2ª Vara Cível do Foro de Santo André",
    kind: "Intimação",
    document_type: "Despacho",
    class_name: "BUSCA E APREENSÃO EM ALIENAÇÃO FIDUCIÁRIA",
    process_number: PROC_DIGITS,
    process_number_masked: PROC_MASKED,
    process_id: PROC,
    parties: [
      { name: "BANCO EXEMPLO FINANCIAMENTOS S.A.", side: "ativo" },
      { name: "MARIA APARECIDA DOS SANTOS", side: "passivo" },
    ],
    lawyers: [LAWYER, { name: "RENATA OLIVEIRA PRADO", oab: "201457", uf: "SP" }],
    link: LINK,
    cancelled: false,
    cancel_reason: null,
    status: "para_conferir",
    ai_status: "pronta",
    ai_reading: null,
    ai_read_at: `${p.available_date}T13:12:00Z`,
    ai_error: null,
    reviewed_by: null,
    reviewed_at: null,
    review_note: null,
    calculation_id: null,
    task_id: null,
    movement_id: null,
    whatsapp_notified_at: `${p.available_date}T13:15:00Z`,
    whatsapp_notified_to: "u1",
    captured_at: captured,
    created_at: captured,
    updated_at: captured,
    ...p,
  };
}

export const mockPublications: CourtPublication[] = [
  pub({
    id: "pub-001",
    available_date: "2026-11-12",
    publication_date: "2026-11-13",
    document_type: "Ato ordinatório",
    text:
      "Processo 1002345-67.2026.8.26.0554 - Busca e Apreensão em Alienação Fiduciária - Alienação Fiduciária - " +
      "BANCO EXEMPLO FINANCIAMENTOS S.A. - MARIA APARECIDA DOS SANTOS - Vistos. Juntada a contestação de fls. 112/148, " +
      "com documentos. Nos termos do artigo 351 do Código de Processo Civil, manifeste-se a parte autora em réplica, " +
      "no prazo de 15 (quinze) dias, oportunidade em que deverá especificar as provas que pretende produzir, " +
      "justificando sua pertinência, sob pena de preclusão. Intime-se. - ADV: JEAN BRAZ (OAB 459159/SP), " +
      "RENATA OLIVEIRA PRADO (OAB 201457/SP)",
    ai_reading: reading({
      actType: "Intimação para réplica",
      summary:
        "O juiz juntou a contestação da ré e abriu prazo de 15 dias para a réplica, com especificação de provas.",
      suggestedDays: 15,
      suggestedUnit: "uteis",
      taskTitle: "Réplica à contestação",
      legalBasis: "CPC, art. 351",
      quote: "manifeste-se a parte autora em réplica, no prazo de 15 (quinze) dias",
      confidence: "alta",
    }),
  }),
  pub({
    id: "pub-002",
    available_date: "2026-11-13",
    publication_date: "2026-11-16",
    organ: "5ª Vara Cível do Foro de São Bernardo do Campo",
    document_type: "Despacho",
    class_name: "PROCEDIMENTO COMUM CÍVEL",
    process_number: "10087654320258260564",
    process_number_masked: "1008765-43.2025.8.26.0564",
    process_id: null,
    parties: [
      { name: "JOSÉ CARLOS PEREIRA", side: "ativo" },
      { name: "CONSTRUTORA HORIZONTE LTDA.", side: "passivo" },
    ],
    lawyers: [LAWYER],
    text:
      "Processo 1008765-43.2025.8.26.0564 - Procedimento Comum Cível - Indenização por Dano Material - " +
      "JOSÉ CARLOS PEREIRA - CONSTRUTORA HORIZONTE LTDA. - Vistos. Juntado o laudo pericial (fls. 301/356). " +
      "Manifestem-se as partes sobre o laudo, no prazo comum de 15 (quinze) dias, nos termos do art. 477, §1º, do CPC. " +
      "No mesmo prazo, os assistentes técnicos poderão apresentar seus pareceres. Após, tornem conclusos. " +
      "Int. - ADV: JEAN BRAZ (OAB 459159/SP)",
    ai_reading: reading({
      actType: "Manifestação sobre laudo pericial",
      summary: "Laudo pericial juntado. Prazo comum de 15 dias para as partes se manifestarem.",
      suggestedDays: 15,
      suggestedUnit: "uteis",
      taskTitle: "Manifestação sobre o laudo pericial",
      legalBasis: "CPC, art. 477, §1º",
      quote: "Manifestem-se as partes sobre o laudo, no prazo comum de 15 (quinze) dias",
      uncertain: ["processo"],
      confidence: "media",
    }),
  }),
  pub({
    id: "pub-003",
    available_date: "2026-11-16",
    publication_date: "2026-11-17",
    document_type: "Decisão",
    text:
      "Processo 1002345-67.2026.8.26.0554 - Busca e Apreensão em Alienação Fiduciária - Alienação Fiduciária - " +
      "BANCO EXEMPLO FINANCIAMENTOS S.A. - MARIA APARECIDA DOS SANTOS - Vistos. Diante do pedido de fls. 160, " +
      "manifeste-se a parte contrária. Oficie-se à Fazenda do Estado de São Paulo, que integra a lide como terceira " +
      "interessada, para que informe sobre os débitos de IPVA do veículo. Prazo legal. Intimem-se. - ADV: JEAN BRAZ " +
      "(OAB 459159/SP), RENATA OLIVEIRA PRADO (OAB 201457/SP)",
    ai_reading: reading({
      actType: "Intimação para manifestação",
      summary:
        "O juiz pediu manifestação sobre o pedido de fls. 160 em \"prazo legal\", sem dizer os dias. A Fazenda do Estado aparece como terceira interessada.",
      suggestedDays: 5,
      suggestedUnit: "uteis",
      taskTitle: "Manifestação sobre o pedido de fls. 160",
      legalBasis: "CPC, art. 218, §3º (prazo de 5 dias quando a lei e o juiz não fixam)",
      quote: "manifeste-se a parte contrária. [...] Prazo legal.",
      uncertain: ["dias", "dobro"],
      confidence: "baixa",
    }),
  }),
  pub({
    id: "pub-004",
    available_date: "2026-11-05",
    publication_date: "2026-11-06",
    document_type: "Sentença",
    status: "confirmada",
    text:
      "Processo 1002345-67.2026.8.26.0554 - Busca e Apreensão em Alienação Fiduciária - BANCO EXEMPLO FINANCIAMENTOS S.A. - " +
      "MARIA APARECIDA DOS SANTOS - Vistos. Recebo os embargos de declaração, pois tempestivos. Manifeste-se a parte " +
      "embargada, no prazo de 5 (cinco) dias, nos termos do art. 1.023, §2º, do CPC. Int. - ADV: JEAN BRAZ (OAB 459159/SP)",
    ai_reading: reading({
      actType: "Contrarrazões aos embargos de declaração",
      summary: "Embargos de declaração recebidos. Prazo de 5 dias para a parte embargada se manifestar.",
      suggestedDays: 5,
      suggestedUnit: "uteis",
      taskTitle: "Contrarrazões aos embargos de declaração",
      legalBasis: "CPC, art. 1.023, §2º",
      quote: "Manifeste-se a parte embargada, no prazo de 5 (cinco) dias",
      confidence: "alta",
    }),
    reviewed_by: "u1",
    reviewed_at: "2026-11-17T11:20:00Z",
    calculation_id: "calc-901",
    task_id: "task-901",
    movement_id: "mov-901",
  }),
  pub({
    id: "pub-005",
    available_date: "2026-11-10",
    publication_date: "2026-11-11",
    organ: "1ª Vara do Juizado Especial Cível de Santo André",
    class_name: "PROCEDIMENTO DO JUIZADO ESPECIAL CÍVEL",
    process_number: "00012345620268260554",
    process_number_masked: "0001234-56.2026.8.26.0554",
    process_id: null,
    status: "descartada",
    kind: "Intimação",
    document_type: "Certidão",
    parties: [
      { name: "ANA PAULA REIS", side: "ativo" },
      { name: "LOJAS EXEMPLO S.A.", side: "passivo" },
    ],
    lawyers: [{ name: "JEAN BRAZ", oab: "459159", uf: "SP" }],
    text:
      "Processo 0001234-56.2026.8.26.0554 - Procedimento do Juizado Especial Cível - ANA PAULA REIS - LOJAS EXEMPLO S.A. - " +
      "Certifico e dou fé que a audiência de conciliação foi redesignada para data a ser informada. Nada mais. " +
      "- ADV: JEAN BRAZ (OAB 459159/SP)",
    ai_reading: reading({
      actType: "Certidão de redesignação de audiência",
      summary: "Certidão informando que a audiência de conciliação será remarcada. Não pede providência.",
      requiresAction: false,
      confidence: "alta",
    }),
    reviewed_by: "u1",
    reviewed_at: "2026-11-11T14:05:00Z",
    review_note: "Só informa a remarcação. Sem prazo para nós; a nova data virá em outra intimação.",
  }),
];
