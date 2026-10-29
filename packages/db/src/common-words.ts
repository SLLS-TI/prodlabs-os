// Words that are also people's names (first names, surnames, nickname prefixes,
// usernames) but read as ordinary words in Portuguese or English text, product jargon
// or code. The identity scrubber (masking.ts) never rewrites one of them on its own:
// it is rewritten only as part of a full name ('Ana Costa'), after an '@', or where a
// handle is expected. Lowercase, without accents.
const WORDS = `
a o e de da do das dos em no na nos nas um uma uns umas por para pra com sem sob
que se ou mas mais menos ja nao sim tem ter ser foi sao era vai vou ver vem ai la
ali aqui isso isto esse essa este esta aquele aquela tudo todo toda todos todas
nada algo alguem ninguem cada outro outra muito muita pouco pouca bem mal bom boa
ate apos antes depois agora hoje ontem amanha sempre nunca onde quando como porque
qual quais quem cujo pelo pela pelos pelas num numa dum duma lhe lhes meu minha seu
sua nosso nossa dele dela eles elas voce voces gente

the and for are but not you all any can had her was one our out day get has him his
how man new now old see two way who boy did its let put say she too use dad mom yes
off big end far few got lot own run set top try why yet ago age air ask bad bed box
bus buy car cat cow cry cup cut dog dry due ear eat egg eye fan fat fit fix fly fun
gas god gun hat hit hot ice ill job key kid lay leg lie lip log low map mix net nor
nut oil pay pen pet pie pin pop pot raw red rid row sad sea sex shy sit six sky son
sum sun tax tea ten tie tip toe ton toy war web wet win won yes zip via per pro con
com org edu gov www http https html json api app web url uri ftp ssh cli sdk dev
ops qa ui ux id ids sql css png jpg gif svg pdf csv xml yaml env log logs tmp
max min avg sum std art gene lee ray guy dean pat sue tom
kit rod will mark bill rose may june april august summer dawn hope joy
grace faith rich chase hunter carter mason cook baker page bell ford stone hill
field banks frank earnest sterling sky star dash rusty buck dusty sandy holly ivy
iris violet ruby pearl crystal amber jade jasmine daisy lily olive hazel ginger
honey cherry autumn winter river brook forest glen heath cliff wade chip chuck bud
drew miles grant pierce price rocky wes sage reed rush west north south east case
cole gray grey green white black brown young king knight wolf fox crane swan bird
robin finch drake hawk booth cross lord prince duke earl marshal sharp smart strong
wise best short long little large small power love major minor noble gold silver
bond moon sunny storm rain snow sun day night morning evening sole sales lane park
hall wood woods glass mill miller smith taylor walker turner parker cooper porter
fisher fletcher potter ward wells young hunt rice bush lamb march may tuesday
penny nova angel victory gloria faith patience prudence constance felicity

code coder codes review reviewer reviewers design designer designs admin admins
support suporte team teams user users owner owners member members client clients
cliente clientes agent agents bot bots test tests tester product products
manager managers lead leads staff help helper info contact contato hello ola oi
sales vendas marketing finance financeiro comercial ops operations office escritorio
studio agency agencia company empresa group grupo system sistema service servico
bot robo robot assistant assistente reviewer writer editor planner tracker builder
runner worker scheduler monitor notifier sync syncer importer exporter

caro cara mate beat leon fern gust robe rica nata vane sand vale lore thai barb
maxi well wash ever rein alta gera lean orla mart mira para pena bate casa mais
dona bela tina lina luna sara mara rena

campos costa lima rocha leite branco branca ramos cruz prado rosa clara vitoria
luz sol mar flor paz neves reis rei rainha santo santa anjos pontes ponte torres
nascimento dias correia pinto machado barros cunha matos porto rios valente bueno
leal franco lago serra coelho conceicao paixao fontes falcao lobo leao carneiro
cordeiro pastor bispo guerra terra mata vale monte salgado doce amor pinheiro frota
bandeira calado jardim leme neto filho junior sobrinho preto pardo moreno bravo
bonito novo velho grande pequeno severo fiel mel pedra barreira gloria graca aurora
estrela socorro fe esperanca bela linda celeste margarida serena augusto modesto
justo feliz prudente amado ventura candido natal domingos clemente sales lia
mel tom lua sereno benigno inocencio honorio constante alegria dores luzia
`;

export const COMMON_WORDS: ReadonlySet<string> = new Set(WORDS.split(/\s+/).filter(Boolean));
