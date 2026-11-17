# Prazos e calendário forense (fase 5)

O CRM calcula prazos processuais do TJSP e mostra a conta passo a passo. O
resultado é uma **sugestão**: o prazo só vale depois que o advogado confere e
confirma. Tudo fica num histórico que o banco não deixa editar nem apagar.

## Onde fica

- **Prazos** (`/prazos`): calculadora, resultado e os últimos cálculos.
- **Calendário forense** (`/prazos/calendario`): os dias sem contagem do ano.
- **Página do processo**: cartão "Prazos calculados", com o histórico daquele
  processo e o botão **Calcular** (abre `/prazos?processo=ID`).
- **Assistente**: a ferramenta `calcular_prazo` responde perguntas como
  "quando vence 15 dias úteis da intimação disponibilizada em 16/11?". Ela não
  grava nada. Quando o assistente prepara um rascunho de prazo com essa data,
  a data vai marcada como incerta.

## Como a conta é feita

1. **Início**
   - *Disponibilização no DJEN*: a publicação é o 1º dia útil seguinte à
     disponibilização (Lei 11.419/2006, art. 4º, §3º). O prazo começa no 1º
     dia útil seguinte à publicação (art. 4º, §4º, e CPC art. 224, §3º).
   - *Intimação (ciência)*: o dia da intimação não conta; o prazo começa no 1º
     dia útil seguinte (CPC art. 224).
2. **Dobro**: se marcado, os dias são multiplicados por 2 (CPC arts. 180, 183,
   186 e 229).
3. **Contagem**
   - *Dias úteis*: conta só dias úteis (CPC art. 219).
   - *Dias corridos*: conta todos os dias, menos os do recesso (CPC art. 220).
     Se o último dia não for útil, o prazo vai para o próximo dia útil (CPC
     art. 224, §1º).
4. **Resultado**: data final, cada passo com a regra usada e a lista de dias
   pulados com o motivo e a fonte.

### Dias que não contam

| Dia | Fonte | Onde está |
| --- | --- | --- |
| Sábados e domingos | CPC art. 216 | automático |
| 01/01, 21/04, 01/05, 07/09, 02/11, 15/11, 25/12 | Lei 662/1949 (redação da Lei 10.607/2002) | automático |
| 12/10 | Lei 6.802/1980 | automático |
| 20/11 | Lei 14.759/2023 | automático |
| 09/07 (feriado estadual de SP) | Lei estadual 9.497/1997 | automático |
| 20/12 a 20/01 (recesso, prazos suspensos) | CPC art. 220 | automático |
| Carnaval (segunda e terça), Quinta e Sexta-feira Santa, Corpus Christi | Calendário forense do TJSP (provimento do CSM do ano) | tabela (semente de 2026 e 2027) |
| Feriados municipais, suspensões pontuais, pontos facultativos | o que o Admin cadastrar | tabela |

A Quarta-feira de Cinzas **conta** (há expediente).

Disponibilização ou intimação dentro do recesso: a publicação fica para 21/01
e o prazo começa em 22/01 (os dias do recesso são tratados como não úteis).

## Confirmar, ajustar, descartar

Depois de calcular (quem não é Visualizador), a conta é registrada no histórico
como **Cálculo**. Em seguida:

- **Confirmar e criar prazo**: cria a tarefa "Prazo: ..." com prioridade alta,
  vencendo às 23:59 da data final, ligada ao processo. Se marcado, atualiza o
  "próximo prazo" do processo. Registra **Confirmado** com a tarefa.
- **Ajustar data**: o advogado informa a data correta e o motivo
  (obrigatório). Registra **Ajuste** ligado ao cálculo anterior. Depois é só
  confirmar.
- **Descartar**: registra **Descartado** (motivo opcional).

Cada cálculo só pode ser confirmado ou descartado uma vez. O Visualizador
calcula, mas não grava. Tudo entra também na auditoria (`audit_logs`).

No modo demonstração (sem Supabase) a conta é feita de verdade, mas nada é
gravado.

## Cadastrar dias no calendário (Admin)

Em `/prazos/calendario`, escolha o ano e use **Cadastrar dia**:

- **Data**, **tipo** (suspensão, feriado, feriado municipal, ponto facultativo),
  **comarca** (vazia = todas; obrigatória no feriado municipal),
  **descrição** e **fonte** (obrigatória: lei, provimento ou comunicado, com
  link se houver).
- Todo dia cadastrado deixa de ser útil na conta (inclusive ponto facultativo:
  cadastre só quando não houver expediente).
- **Remover** pede o motivo. O dia continua na lista, riscado, e sai das contas
  seguintes. O banco não deixa apagar nem mudar os dados de um dia; para
  corrigir, remova e cadastre de novo.

Todo ano, confira o provimento do Conselho Superior da Magistratura (CSM) do
TJSP com o calendário do ano e cadastre o que faltar. Se o ano não tiver nenhum
dia cadastrado, a conta mostra um aviso.

## Limites

- **Feriados municipais** não são automáticos: cadastre os de cada comarca em
  que o escritório atua e informe a comarca na conta.
- **Suspensões pontuais** (falha do sistema, portarias, greve, eventos) só
  entram se forem cadastradas.
- A conta segue o CPC. Prazos com regra própria (penal, juizados com regra
  local, prazos materiais como decadência, que não suspendem no recesso) devem
  ser conferidos à mão.
- O prazo oficial é o da intimação e o do sistema do tribunal.

## Banco de dados

Arquivo `supabase/fase5-prazos.sql` (seguro rodar de novo):

- `forensic_calendar_days`: equipe lê; só Admin cadastra e remove. Sem DELETE;
  UPDATE só para preencher a remoção uma vez.
- `deadline_calculations`: equipe lê; quem não é Visualizador insere em nome
  próprio. Ninguém altera nem apaga (nem o service role). TRUNCATE bloqueado.
  Se um processo ou tarefa for apagado, o vínculo fica vazio e o registro
  continua.
