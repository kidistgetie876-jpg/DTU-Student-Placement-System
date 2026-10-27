import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const amharicTranslations = {
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
  'Approval Requests': 'የማጽደቅ ጥያቄዎች',
  'Capacity Used': 'ያገለገለ አቅም',
  'Capacity Utilized': 'ያገለገለ አቅም',
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
  'DEBRE TABOR UNIVERSITY': 'ደብረ ታቦር ዩኒቨርሲቲ',
  'Student Department Placement System': 'የተማሪ ዲፓርትመንት ምደባ ስርዓት',
  Home: 'መነሻ',
  Services: 'አገልግሎቶች',
  'Placement Info': 'የምደባ መረጃ',
  Announcements: 'ማስታወቂያዎች',
  Contact: 'ያግኙን',
  Login: 'ግባ',
  Logout: 'ውጣ',
  'Active Admins': 'ንቁ አስተዳዳሪዎች',
  'Total Heads': 'ጠቅላላ የዲፓርትመንት ኃላፊዎች',
  'Loading notifications...': 'ማሳወቂያዎች በመጫን ላይ...',
  'No notifications.': 'ማሳወቂያዎች የሉም።',
  Notification: 'ማሳወቂያ',
  Unread: 'ያልተነበበ',
  unread: 'ያልተነበቡ',
  'Marking...': 'በማስታወሻ ላይ...',
  'Mark all as read': 'ሁሉንም እንደተነበቡ ምልክት አድርግ',
  Close: 'ዝጋ',
  'Admin Account Settings': 'የአስተዳዳሪ መለያ ቅንብሮች',
  'Update your account details and password.': 'የመለያዎን መረጃ እና የይለፍ ቃል ያዘምኑ።',
  Username: 'የተጠቃሚ ስም',
  'Email Address': 'የኢሜይል አድራሻ',
  'Current Password': 'የአሁኑ የይለፍ ቃል',
  'New Password (Optional)': 'አዲስ የይለፍ ቃል (አማራጭ)',
  'Confirm New Password': 'አዲሱን የይለፍ ቃል ያረጋግጡ',
  'Edit Profile': 'መገለጫን ያርትዑ',
  'Saving...': 'በማስቀመጥ ላይ...',
  'Save Changes': 'ለውጦችን አስቀምጥ',
  Cancel: 'ሰርዝ',
  'User/HOD Data Bulk Import': 'የተጠቃሚ / የዲፓርትመንት ኃላፊ መረጃ በጅምላ ማስገቢያ',
  'Student Data Bulk Import': 'የተማሪ መረጃ በጅምላ ማስገቢያ',
  'Student files are matched by Student ID or username. User/HOD files are detected by User ID or Role headers and imported separately. New accounts require a valid @gmail.com address.': 'የተማሪ ፋይሎች በተማሪ መለያ ወይም በተጠቃሚ ስም ይለያሉ። የተጠቃሚ / የዲፓርትመንት ኃላፊ ፋይሎች በመለያ ወይም በሚና ርዕስ ይለያሉ። አዲስ መለያ @gmail.com አድራሻ ያስፈልገዋል።',
  'Preview File': 'ፋይሉን ቅድመ እይታ',
  'Save to System': 'ወደ ስርዓቱ አስቀምጥ',
  'Preview (Sample)': 'ቅድመ እይታ (ናሙና)',
  'USER ID': 'የተጠቃሚ መለያ',
  'FIRST NAME': 'ስም',
  'LAST NAME': 'የአባት ስም',
  USERNAME: 'የተጠቃሚ ስም',
  EMAIL: 'ኢሜይል',
  PHONE: 'ስልክ',
  ROLE: 'ሚና',
  'Student ID': 'የተማሪ መለያ',
  'First Name': 'ስም',
  'Last Name': 'የአባት ስም',
  Email: 'ኢሜይል',
  Phone: 'ስልክ',
  Stream: 'የትምህርት ዘርፍ',
  Gender: 'ጾታ',
  'Manage DTU Departments': 'የዲቲዩ ዲፓርትመንቶችን ያስተዳድሩ',
  'Create academic units and assign leadership.': 'የትምህርት ክፍሎችን ይፍጠሩ እና ኃላፊዎችን ይመድቡ።',
  '+ Assign Head': '+ ኃላፊ መድብ',
  'Add New Department': 'አዲስ ዲፓርትመንት ጨምር',
  'Select Stream': 'የትምህርት ዘርፍ ይምረጡ',
  'Add New Stream': 'አዲስ የትምህርት ዘርፍ ጨምር',
  College: 'ኮሌጅ',
  'Select College': 'ኮሌጅ ይምረጡ',
  'Add New College': 'አዲስ ኮሌጅ ጨምር',
  'Department Name': 'የዲፓርትመንት ስም',
  Description: 'መግለጫ',
  'Optional details...': 'አማራጭ ዝርዝሮች...',
  Processing: 'በሂደት ላይ',
  'Processing...': 'በሂደት ላይ...',
  'Register Department': 'ዲፓርትመንት መዝግብ',
  'Search departments': 'ዲፓርትመንቶችን ፈልግ',
  'Search departments...': 'ዲፓርትመንቶችን ፈልግ...',
  Search: 'ፈልግ',
  'No departments found.': 'ዲፓርትመንቶች አልተገኙም።',
  'Loading departments...': 'ዲፓርትመንቶች በመጫን ላይ...',
  'Not Set': 'አልተዘጋጀም',
  'Not Assigned': 'አልተመደበም',
  Previous: 'ቀዳሚ',
  Next: 'ቀጣይ',
  'Page {current} of {total}': 'ገጽ {current} ከ {total}',
  'STREAM': 'የትምህርት ዘርፍ',
  'COLLEGE': 'ኮሌጅ',
  'NAME': 'ስም',
  'CAPACITY': 'አቅም',
  'HEAD NAME': 'የኃላፊ ስም',
  'EDIT': 'አርትዕ',
  'Department Capacity': 'የዲፓርትመንት አቅም',
  Edit: 'አርትዕ',
  Depts: 'ዲፓርትመንቶች',
  'e.g. Computer Science': 'ለምሳሌ ኮምፒውተር ሳይንስ',
  characters: 'ቁምፊዎች',
  'Showing {start} - {end} of {total}': '{start} - {end} ከ {total} በማሳየት ላይ',
  'Confirm': 'አረጋግጥ',
  'Change Password': 'የይለፍ ቃል ይቀይሩ',
  'Profile updated successfully.': 'መገለጫው በተሳካ ሁኔታ ተዘምኗል።',
  'Password changed successfully.': 'የይለፍ ቃሉ በተሳካ ሁኔታ ተቀይሯል።',
  'Profile Photo': 'የመገለጫ ፎቶ',
  'Profile preview': 'የመገለጫ ቅድመ እይታ',
  'JPEG, PNG, or WebP; up to 5 MB.': 'JPEG፣ PNG ወይም WebP፤ እስከ 5 MB።',
  'Full Name': 'ሙሉ ስም',
  'Save Profile': 'መገለጫን አስቀምጥ',
  'Saving…': 'በማስቀመጥ ላይ...',
  'New Password': 'አዲስ የይለፍ ቃል',
  'Choose a JPEG, PNG, or WebP image.': 'JPEG፣ PNG ወይም WebP ምስል ይምረጡ።',
  'Profile photos must be 5 MB or smaller.': 'የመገለጫ ፎቶዎች 5 MB ወይም ከዚያ በታች መሆን አለባቸው።',
  'Enter your full name.': 'ሙሉ ስምዎን ያስገቡ።',
  'Enter a valid email address.': 'ትክክለኛ የኢሜይል አድራሻ ያስገቡ።',
  'Unable to update profile.': 'መገለጫውን ማዘመን አልተቻለም።',
  'confirm password': 'የይለፍ ቃሉን ያረጋግጡ',
  'current password': 'የአሁኑ የይለፍ ቃል',
  'new password': 'አዲስ የይለፍ ቃል',
  'Student dashboard': 'የተማሪ ዳሽቦርድ',
  'Your academic progress and placement updates at a glance.': 'የትምህርት እድገትዎን እና የምደባ ዝማኔዎችን በአንድ እይታ ይመልከቱ።',
  'Click to view details': 'ዝርዝሩን ለማየት ይጫኑ',
  'Grade 12 Result': 'የ12ኛ ክፍል ውጤት',
  'COC Result': 'የCOC ውጤት',
  'Final Score': 'የመጨረሻ ውጤት',
  'Placement status': 'የምደባ ሁኔታ',
  'Your current placement progress': 'የአሁኑ የምደባ ሂደትዎ',
  'Your placement in {department} is approved.': 'በ{department} የተመደቡበት ምደባ ጸድቋል።',
  'Your placement is awaiting review or publication.': 'የምደባ ውጤትዎ ግምገማ ወይም ህትመትን በመጠባበቅ ላይ ነው።',
  Approved: 'ጸድቋል',
  Pending: 'በመጠባበቅ ላይ',
  'Recent announcements': 'የቅርብ ማስታወቂያዎች',
  'Latest system notifications': 'የቅርብ የስርዓት ማሳወቂያዎች',
  'View all': 'ሁሉንም ይመልከቱ',
  'Loading recent notifications...': 'የቅርብ ማሳወቂያዎችን በመጫን ላይ...',
  'There are no recent announcements or notifications.': 'የቅርብ ማስታወቂያዎች ወይም ማሳወቂያዎች የሉም።',
  'System notification': 'የስርዓት ማሳወቂያ',
  'New notification': 'አዲስ ማሳወቂያ',
  New: 'አዲስ',
  'Review your personal details and update your placement profile information.': 'የግል መረጃዎን ይመልከቱ እና የምደባ መገለጫዎን ያዘምኑ።',
  'Personal details': 'የግል መረጃ',
  'Full name': 'ሙሉ ስም',
  'Profile preferences': 'የመገለጫ ምርጫዎች',
  'Keep these placement details up to date. Your Registrar can also update them.': 'እነዚህን የምደባ ዝርዝሮች ወቅታዊ ያድርጉ። ሬጅስትራሩም ሊያዘምናቸው ይችላል።',
  Disability: 'የአካል ጉዳት',
  'Minority status': 'የአናሳ ቡድን ሁኔታ',
  Yes: 'አዎ',
  No: 'አይ',
};

const translations = {
  en: Object.fromEntries(Object.keys(amharicTranslations).map((key) => [key, key])),
  am: amharicTranslations,
};

const translate = (language, key, values) => {
  const localized = translations[language]?.[key] || key;
  if (!values || typeof localized !== 'string') return localized;
  return localized.replace(/\{(\w+)\}/g, (placeholder, name) => (
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : placeholder
  ));
};

const LanguageContext = createContext(null);

const getInitialLanguage = () => {
  try {
    return localStorage.getItem('language') === 'am' ? 'am' : 'en';
  } catch {
    return 'en';
  }
};

export const LanguageProvider = ({ children }) => {
  const [language, setLanguageState] = useState(getInitialLanguage);
  const setLanguage = useCallback((nextLanguage) => {
    setLanguageState((current) => {
      const requestedLanguage = typeof nextLanguage === 'function'
        ? nextLanguage(current)
        : nextLanguage;
      return requestedLanguage === 'am' ? 'am' : 'en';
    });
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('language', language);
    } catch {
      // Keep the in-memory language active when browser storage is unavailable.
    }
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo(() => ({
    language,
    setLanguage,
    toggleLanguage: () => setLanguage((current) => current === 'en' ? 'am' : 'en'),
    t: (key, values) => translate(language, key, values),
  }), [language, setLanguage]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    return {
      language: getInitialLanguage(),
      setLanguage: () => undefined,
      toggleLanguage: () => undefined,
      t: (key, values) => translate(getInitialLanguage(), key, values),
    };
  }
  return context;
};

export { translations };
