export type Lang = 'en' | 'es' | 'fr' | 'de' | 'it' | 'pt' | 'ar' | 'he';

interface LangDef {
  label: string;
  bcp: string;
  names: { f: { old: string[]; young: string[] }; m: { old: string[]; young: string[] } };
  towns: string[];
}

export const LANGS: Record<Lang, LangDef> = {
  en: {
    label: 'English',
    bcp: 'en-US',
    names: {
      f: { old: ['Dorothy Mayfield', 'Margaret Pickles', 'Edna Crumble', 'Gloria Fenwick', 'Ruth Marigold', 'Mabel Tuttle', 'Patricia Honeywell', 'Beverly Stroud'], young: ['Linda Barrows', 'Brenda Quill', 'Sheila Thornbury', 'Karen Whitlock', 'Jessica Pennywhistle', 'Ashley Dunmore', 'Megan Tully'] },
      m: { old: ['Harold Biggins', 'Walter Pruitt', 'Gerald Plumtree', 'Bernard Kettle', 'Lloyd Gumbo', 'Stanley Hooper', 'Frank Dobbs'], young: ['Chad Wellington III', 'Tyler Brooks', 'Duke Marlowe', 'Kevin Sprockett', 'Bobby Fizzwater', 'Ricky Salazar', 'Jake Mendel'] },
    },
    towns: ['Tulsa, Oklahoma', 'Duluth, Minnesota', 'Boca Raton, Florida', 'Akron, Ohio', 'Boise, Idaho', 'Little Rock, Arkansas', 'Fresno, California', 'Scranton, Pennsylvania'],
  },
  es: {
    label: 'Español',
    bcp: 'es-ES',
    names: {
      f: { old: ['Carmen Ruiz', 'Dolores Martín', 'Pilar Sánchez', 'Rosario Gómez', 'Encarna López', 'Mercedes Vidal'], young: ['Lucía Fernández', 'Paula Romero', 'Sara Navarro', 'Marta Ortega', 'Andrea Castillo'] },
      m: { old: ['Manolo García', 'Paco Jiménez', 'Antonio Moreno', 'José Luis Díaz', 'Fermín Herrera'], young: ['Javi Torres', 'Álex Delgado', 'Dani Molina', 'Pablo Rubio', 'Sergio Vega'] },
    },
    towns: ['Madrid', 'Sevilla', 'Valencia', 'Bilbao', 'Málaga', 'Zaragoza', 'Murcia', 'Granada'],
  },
  fr: {
    label: 'Français',
    bcp: 'fr-FR',
    names: {
      f: { old: ['Josiane Lefèvre', 'Monique Dubois', 'Ginette Moreau', 'Odette Laurent', 'Huguette Roux'], young: ['Camille Martin', 'Chloé Bernard', 'Léa Petit', 'Manon Girard', 'Inès Fontaine'] },
      m: { old: ['Gérard Lambert', 'Jean-Pierre Mercier', 'Bernard Fournier', 'Roland Chevalier', 'Michel Garnier'], young: ['Kevin Leroy', 'Lucas Morel', 'Hugo Blanc', 'Théo Faure', 'Maxime Rousseau'] },
    },
    towns: ['Marseille', 'Lyon', 'Lille', 'Toulouse', 'Nantes', 'Bordeaux', 'Strasbourg', 'Montpellier'],
  },
  de: {
    label: 'Deutsch',
    bcp: 'de-DE',
    names: {
      f: { old: ['Gisela Schmidt', 'Helga Wagner', 'Ingrid Becker', 'Ursula Hoffmann', 'Brigitte Schulz'], young: ['Lena Fischer', 'Sophie Weber', 'Jana Krüger', 'Lisa Braun', 'Nina Hartmann'] },
      m: { old: ['Günter Müller', 'Klaus Schneider', 'Horst Meyer', 'Dieter Koch', 'Werner Richter'], young: ['Jonas Wolf', 'Tim Schäfer', 'Lukas Neumann', 'Felix Zimmermann', 'Niklas Krause'] },
    },
    towns: ['Berlin', 'Hamburg', 'München', 'Köln', 'Frankfurt', 'Dortmund', 'Leipzig', 'Stuttgart'],
  },
  it: {
    label: 'Italiano',
    bcp: 'it-IT',
    names: {
      f: { old: ['Giuseppina Russo', 'Maria Esposito', 'Carla Bianchi', 'Rosa Romano', 'Lucia Colombo'], young: ['Giulia Ricci', 'Chiara Marino', 'Francesca Greco', 'Sara Bruno', 'Martina Gallo'] },
      m: { old: ['Giuseppe Conti', 'Franco De Luca', 'Salvatore Costa', 'Mario Fontana', 'Enzo Rinaldi'], young: ['Luca Moretti', 'Marco Barbieri', 'Matteo Lombardi', 'Andrea Ferrara', 'Davide Santoro'] },
    },
    towns: ['Napoli', 'Roma', 'Milano', 'Palermo', 'Torino', 'Bologna', 'Bari', 'Firenze'],
  },
  pt: {
    label: 'Português',
    bcp: 'pt-BR',
    names: {
      f: { old: ['Maria das Graças', 'Dona Neide Souza', 'Terezinha Lima', 'Conceição Alves', 'Aparecida Rocha'], young: ['Ana Clara Silva', 'Juliana Costa', 'Larissa Pereira', 'Camila Ribeiro', 'Beatriz Gomes'] },
      m: { old: ['Seu Jorge Oliveira', 'Antônio Carvalho', 'Sebastião Martins', 'Raimundo Barbosa', 'João Batista Dias'], young: ['Lucas Santos', 'Gabriel Ferreira', 'Thiago Araújo', 'Rafael Mendes', 'Bruno Cardoso'] },
    },
    towns: ['São Paulo', 'Rio de Janeiro', 'Belo Horizonte', 'Salvador', 'Recife', 'Fortaleza', 'Curitiba', 'Porto Alegre'],
  },
  ar: {
    label: 'العربية',
    bcp: 'ar-EG',
    names: {
      f: { old: ['الحاجة فاطمة', 'أم محمود', 'سعاد حسن', 'نادية إبراهيم', 'زينب عبد الله'], young: ['نور أحمد', 'سارة خالد', 'ياسمين علي', 'مريم سعيد', 'رنا مصطفى'] },
      m: { old: ['الحاج محمود', 'أبو أحمد', 'عبد الرحمن سالم', 'حسن الشريف', 'مصطفى كامل'], young: ['أحمد طارق', 'عمر حسين', 'كريم يوسف', 'محمد عادل', 'يوسف رامي'] },
    },
    towns: ['القاهرة', 'الإسكندرية', 'عمّان', 'بيروت', 'دبي', 'الدار البيضاء', 'تونس', 'الرياض'],
  },
  he: {
    label: 'עברית',
    bcp: 'he-IL',
    names: {
      f: { old: ['רחל לוי', 'מזל אוחיון', 'אסתר כהן', 'שושנה פרידמן', 'יפה ביטון', 'פנינה שמואלי', 'זהבה אלמוג'], young: ['אורנה גולדברג', 'מרים אזולאי', 'רונית שרעבי', 'מורן דוד', 'שירן חזן', 'ליאת ברק'] },
      m: { old: ['משה ביטון', 'שלמה דהן', 'ניסים פרץ', 'בני שטרן', 'יעקב אלמליח', 'רפי גולן'], young: ['יוסי אברהם', 'אבי גבאי', 'קובי מזרחי', 'איתן מלכה', 'ניר עזרא', 'עומר שלום'] },
    },
    towns: ['בת ים', 'חולון', 'באר שבע', 'קריית שמונה', 'רמת גן', 'אשדוד', 'נתניה', 'פתח תקווה'],
  },
};
export const LANG_LIST = Object.keys(LANGS) as Lang[];
