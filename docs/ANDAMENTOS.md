# Andamentos dos processos (fase 3)

Cada processo tem a seção **Andamentos** (abra o processo em **Processos**).
Os andamentos chegam de dois jeitos:

| Origem | Como entra | Pode mudar? |
| --- | --- | --- |
| **Tribunal** | Busca automática na API pública do CNJ (DataJud), todo dia às 6h (horário de Brasília) e no botão **Buscar agora** | A busca só **acrescenta**. Se alguém da equipe corrigir, o andamento fica **travado** (cadeado) |
| **Equipe** | Botão **Lançar andamento** no processo, ou pedindo ao assistente ("registra que protocolamos a réplica hoje") com confirmação | Nasce travado. A busca automática nunca altera nem apaga |

## Como usar

- **Buscar agora**: consulta o DataJud na hora para aquele processo.
- **Lançar andamento**: data, horário (opcional) e descrição.
- **Editar**: corrige data ou texto. Andamento do tribunal editado fica travado.
- **Apagar / Ocultar**: andamento da equipe é apagado; o do tribunal é só
  ocultado (se fosse apagado, a próxima busca traria de volta).
- **Buscar andamentos automaticamente**: desligue em processos sob segredo
  de justiça ou que não devem ser consultados.
- Andamento novo do tribunal vira notificação (sino). A primeira busca de um
  processo importa o histórico sem notificar.

## Limites do DataJud

- Costuma ter **alguns dias de atraso** em relação ao sistema do tribunal.
  A tela mostra a data da última busca.
- **Não traz processos em segredo de justiça** nem os do STF. Para esses,
  lance os andamentos à mão.
- O tribunal é descoberto pelo próprio número CNJ (segmento e código do
  tribunal), então funciona para qualquer estado, instância e justiça
  (estadual, federal, trabalho, eleitoral, militar, STJ, TST, TSE, STM).
- O prazo oficial continua sendo o da intimação e o do sistema do tribunal.

## Regras no banco (não só no código)

`supabase/assistente-fase3.sql` cria a tabela `process_movements` e:

- A rotina automática grava só pela função `merge_datajud_movements`, que
  **apenas insere** o que falta (chave do tribunal única por processo).
- Gatilho `process_movements_guard`: andamento manual nasce travado; edição
  feita por alguém da equipe trava e registra quem editou; **sem login**
  (rotina automática), qualquer alteração ou exclusão de andamento travado ou
  manual é recusada pelo banco.
- RLS: a equipe vê tudo, lança só andamentos manuais e apaga só os manuais.
- `processes` ganha `sync_enabled`, `last_synced_at` e `sync_error`.

## Implantação

1. Rode `supabase/assistente-fase3.sql` no SQL Editor (depois da fase 2).
2. Na Vercel: `SUPABASE_SERVICE_ROLE_KEY` (já usada nos convites) e
   `CRON_SECRET` (texto aleatório longo). `DATAJUD_API_KEY` é opcional: o app
   usa a chave pública divulgada pelo CNJ; preencha só se o CNJ trocar.
3. O agendamento está em `vercel.json` (`/api/cron/andamentos`, 9h UTC =
   6h de Brasília). A rotina busca até 200 processos por dia, do mais
   desatualizado para o mais recente, e pula os buscados nas últimas 18 horas.
   Processos com status "Encerrado" não são buscados.

## Arquivos

| Peça | Arquivo |
| --- | --- |
| Tribunal pelo número CNJ | `src/lib/datajud/tribunals.ts` |
| Consulta e leitura da resposta | `src/lib/datajud/client.ts`, `parse.ts` |
| Sincronização e notificação | `src/lib/datajud/sync.ts` |
| Rotina diária | `src/app/api/cron/andamentos/route.ts`, `vercel.json` |
| Leitura e ações da tela | `src/lib/data/movements.ts`, `movements-actions.ts` |
| Testes | `tests/datajud.test.ts` |
