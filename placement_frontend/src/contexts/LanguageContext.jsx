import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const translations = {
  'Welcome back': 'እንኳን ደህና መጡ',
  Welcome: 'እንኳን ደህና መጡ',
  Admin: 'አስተዳዳሪ',
  'System Admin': 'የስርዓት አስተዳዳሪ',
  Registrar: 'ሬጅስትራር',
  'Head of Department': 'የዲፓርትመንት ኃላፊ',
  Student: 'ተማሪ',
  'Registrar Portal': 'የሬጅስትራር ፖርታል',
  'Placement Admin': 'የምደባ አስተዳዳሪ',
  'Department Head': 'የዲፓርትመንት ኃላፊ',
  'DTU Student Portal': 'የዲቲዩ ተማሪ ፖርታል',
  'Placement workspace': 'የምደባ የሥራ ቦታ',
  Overview: 'አጠቃላይ እይታ',
  Dashboard: 'ዳሽቦርድ',
  'System Overview': 'የስርዓት አጠቃላይ እይታ',
  'Student Information': 'የተማሪ መረጃ',
  'Import Student Data': 'የተማሪ መረጃ አስገባ',
  'Student Choice Matrix': 'የተማሪ ምርጫ ሰንጠረዥ',
  'Department Status': 'የዲፓርትመንት ሁኔታ',
  'Placement Rules': 'የምደባ ደንቦች',
  'Placement Deadlines': 'የምደባ የመጨረሻ ቀኖች',
  'Run Placement': 'ምደባን አስኪድ',
  'Approve & Publish Results': 'ውጤቶችን አጽድቅ እና አትም',
  'Unassigned Students': 'ያልተመደቡ ተማሪዎች',
  'Handle Appeals': 'ይግባኞችን አስተናግድ',
  Appeals: 'ይግባኞች',
  'Reports & Approvals': 'ሪፖርቶች እና ማጽደቂያዎች',
  'Placed Students': 'የተመደቡ ተማሪዎች',
  Reports: 'ሪፖርቶች',
  Preferences: 'ምርጫዎች',
  'Profile & Preferences': 'መገለጫ እና ምርጫዎች',
  'Submit Preferences': 'ምርጫዎችን አስገባ',
  'Placement Result': 'የምደባ ውጤት',
  'Submit Complaints / Help': 'ቅሬታ / እገዛ ጠይቅ',
  Notifications: 'ማሳወቂያዎች',
  'User Management': 'የተጠቃሚ አስተዳደር',
  'Manage Departments': 'ዲፓርትመንቶችን አስተዳድር',
  'Contact Messages': 'የመገኛ መልዕክቶች',
  'Data Import': 'መረጃ አስገባ',
  'Audit Logs / System Health': 'የኦዲት መዝገቦች / የስርዓት ጤና',
  Settings: 'ቅንብሮች',
  'Account Settings': 'የመለያ ቅንብሮች',
  Departments: 'ዲፓርትመንቶች',
  'Active Students': 'ንቁ ተማሪዎች',
  'Placements Completed': 'የተጠናቀቁ ምደባዎች',
  'Unplaced Students': 'ያልተመደቡ ተማሪዎች',
  'Pending Approvals': 'በመጠባበቅ ላይ ያሉ ማጽደቂያዎች',
  'Total Students': 'ጠቅላላ ተማሪዎች',
  'Total Departments': 'ጠቅላላ ዲፓርትመንቶች',
  'Active Administrators': 'ንቁ አስተዳዳሪዎች',
  'Department Capacity': 'የዲፓርትመንት አቅም',
  'Approval Requests': 'የማጽደቅ ጥያቄዎች',
  'Capacity Used': 'ያገለገለ አቅም',
  'Capacity Utilized': 'ያገለገለ አቅም',
  'Click to view details': 'ዝርዝሩን ለማየት ይጫኑ',
  'Switch to dark mode': 'ወደ ጨለማ ገጽታ ቀይር',
  'Switch to light mode': 'ወደ ብርሃን ገጽታ ቀይር',
  'Switch to eye care mode': 'የዓይን እረፍት ገጽታን ክፈት',
  'Turn off eye care mode': 'የዓይን እረፍት ገጽታን ዝጋ',
  'Eye Care': 'ለዓይን ተስማሚ',
  Light: 'ብርሃን',
  Dark: 'ጨለማ',
  'Select language': 'ቋንቋ ይምረጡ',
  'User profile menu': 'የተጠቃሚ መገለጫ ምናሌ',
  'My Dashboard': 'የእኔ ዳሽቦርድ',
  'View Profile / Edit Profile': 'መገለጫን ይመልከቱ / ያርትዑ',
  'Change Password': 'የይለፍ ቃል ይቀይሩ',
  'Dashboard Settings': 'የዳሽቦርድ ቅንብሮች',
  Language: 'ቋንቋ',
  Appearance: 'ገጽታ',
  'Sign Out': 'ውጣ',
  'Review placements, departments, and approvals.': 'ምደባዎችን፣ ዲፓርትመንቶችን እና ማጽደቂያዎችን ይገምግሙ።',
  'Manage users, departments, and reports.': 'ተጠቃሚዎችን፣ ዲፓርትመንቶችን እና ሪፖርቶችን ያስተዳድሩ።',
  'Department leadership tools and placement oversight.': 'የዲፓርትመንት አመራር መሣሪያዎች እና የምደባ ክትትል።',
  'Profile, preferences, and placement updates.': 'መገለጫ፣ ምርጫዎች እና የምደባ ዝማኔዎች።',
  'Use the navigation panel to review users, departments, and dashboard insights.': 'ተጠቃሚዎችን፣ ዲፓርትመንቶችን እና የዳሽቦርድ መረጃዎችን ለመገምገም የአሰሳ ፓነሉን ይጠቀሙ።',
  'Debre Tabor University registrar workflow: department review, placement approval, and publishing decisions.': 'የደብረ ታቦር ዩኒቨርሲቲ የሬጅስትራር ሥራ፦ የዲፓርትመንት ግምገማ፣ የምደባ ማጽደቅ እና የማተሚያ ውሳኔዎች።',
  'Track placement progress, approve department allocations, and monitor student outcomes.': 'የምደባ ሂደትን ይከታተሉ፣ የዲፓርትመንት ምደባዎችን ያጽድቁ እና የተማሪዎችን ውጤት ይከታተሉ።',
  'DTU academic departments': 'የዲቲዩ የትምህርት ዲፓርትመንቶች',
  'Awaiting placement run': 'የምደባ ሂደትን በመጠባበቅ ላይ',
  'Awaiting registrar approval': 'የሬጅስትራር ማጽደቅን በመጠባበቅ ላይ',
  'Verified for this cycle': 'ለዚህ ዙር የተረጋገጡ',
};

const LanguageContext = createContext(null);

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState(() => (
    localStorage.getItem('language') === 'am' ? 'am' : 'en'
  ));

  useEffect(() => {
    localStorage.setItem('language', language);
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo(() => ({
    language,
    setLanguage,
    toggleLanguage: () => setLanguage((current) => current === 'en' ? 'am' : 'en'),
    t: (text) => language === 'am' ? translations[text] || text : text,
  }), [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within a LanguageProvider.');
  return context;
};
