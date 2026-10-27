// የ 2ኛ ሴሚስተር ምርጫ ክፍት መሆኑን ማረጋገጫ
$settingRes = $db->query("SELECT is_second_sem_choice_open FROM placement_settings WHERE id = 1");
$setting = $settingRes->fetch_assoc();
$isSecondSemOpen = (bool)($setting['is_second_sem_choice_open'] ?? false);

// ተማሪው Pending 2nd Semester ከሆነ እና ፖርታሉ ከተከፈተ Lock አይሆንም
if ($studentStatus === 'Pending 2nd Semester') {
    if ($isSecondSemOpen) {
        $isLocked = false; // ምርጫ መምረጥ ትችላለች!
        $message = "ለ 2ኛ ሴሚስተር ዲፓርትመንት ምርጫዎን ያስገቡ።";
    } else {
        $isLocked = true; // ገና አልተከፈተም
        $message = "የ 2ኛ ሴሚስተር ዲፓርትመንት ምደባ አልተከፈተም። እባክዎን የሬጅስትራር ማስታወቂያ ይከታተሉ።";
    }
}