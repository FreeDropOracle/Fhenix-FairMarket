# Whitepaper Positioning: Fhenix-Led Privacy Architecture

تاريخ الصياغة: `2026-04-28`

## الصياغة الرسمية المختصرة

مشروع `Fhenix FairMarket` هو بروتوكول مزادات سرية تقوده `Fhenix`، ويجمع بين التنفيذ المشفر وطبقات خصوصية بروتوكولية إضافية لتقليل التسرب على السلسلة عبر مراحل المزايدة والتسوية والمطالبة. لا يستبدل هذا التصميم `Fhenix`، بل يوسّعها عمليًا للوصول إلى مستوى أعلى من الخصوصية التشغيلية.

## Whitepaper-Ready English Version

`Fhenix FairMarket` is a Fhenix-led confidential auction protocol that combines encrypted execution with additional protocol privacy layers to minimize on-chain leakage across bidding, settlement, and claims. This design does not replace Fhenix; it operationally extends it to achieve stronger end-to-end privacy.

## الصياغة الرسمية الموسعة

يعتمد المشروع في جوهره على `Fhenix / CoFHE` لتنفيذ منطق المزاد السري والتعامل مع العروض المشفرة. ومع تطور المتطلبات نحو "السرية القصوى"، تمت إضافة طبقات خصوصية بروتوكولية مكملة لمعالجة التسربات التي قد تبقى ظاهرة على السلسلة حتى مع وجود حسابات مشفرة، مثل قابلية الربط بين المطالبات، أو ظهور بعض المؤشرات التجميعية، أو انكشاف بعض مسارات التسوية والمطالبة.

بالتالي، فالوصف الأدق للمنصة ليس أنها `Fhenix-only` بالمعنى الضيق، ولا أنها بروتوكول `ZK-only`، بل إنها:

`Fhenix-first hybrid privacy architecture`

أي:

`معمارية خصوصية هجينة تقودها Fhenix`

## ما الذي يبقى ضمن اختصاص Fhenix؟

- تمثيل العروض المشفرة
- تنفيذ منطق المزايدة السرية
- مسار التسوية المعتمد على البيانات المشفرة
- التفاعل الأساسي مع `CoFHE` وطبقات التنفيذ السري

## ما الذي تتولاه طبقات الخصوصية المكملة؟

- `shielded escrow`
- `blind resolution`
- `identity aliasing`
- `authorized private claims`
- `aggregate privacy hardening`
- `proof-carried bid admission`
- `verifier boundary` تمهيدًا لـ ZK verifier فعلية

## لماذا هذه الصياغة مهمة؟

هذه الصياغة تحفظ هوية المشروع الأصلية، وفي الوقت نفسه تعكس الواقع الهندسي بدقة. فهي لا تدّعي أن `Fhenix` وحدها تغلق كل آثار السلسلة، ولا تصور الطبقات الإضافية كخروج عن المشروع، بل تقدمها كامتداد طبيعي لتحقيق هدف المنصة الأعلى: تقليل التسرب إلى أقصى درجة ممكنة.

## جملة اعتماد مقترحة للوثائق الرسمية

يمكن اعتماد الجملة التالية كما هي داخل الـ whitepaper أو الوثائق الرسمية:

> Fhenix FairMarket is a Fhenix-led confidential marketplace architecture that combines encrypted auction execution with protocol-level privacy hardening to minimize observable leakage across bidding, settlement, and claims.

والصياغة العربية المقابلة:

> Fhenix FairMarket هو معمارية سوق سرية تقودها Fhenix، وتجمع بين تنفيذ المزادات المشفر وطبقات تقوية خصوصية على مستوى البروتوكول لتقليل التسرب القابل للملاحظة عبر المزايدة والتسوية والمطالبة.

## توصية تحريرية

إذا تم تحديث الورقة البيضاء لاحقًا، فمن الأفضل استخدام إحدى الصيغ أعلاه بدل أي وصف يوحي بأن المشروع:

- `Fhenix-only` بشكل مطلق
- أو `ZK-only`
- أو بديل كامل عن أحد المسارين

الوصف الأكثر دقة وصدقًا هو:

`Fhenix-led hybrid confidential marketplace`
