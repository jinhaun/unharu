(function(){
'use strict';
const guides = {
 sqld:{scope:['데이터 모델링의 이해','SQL 기본 및 활용'],note:'현재 세부 출제기준 원문을 다시 확인하지 못했습니다. 과목 개요만 제공하며 최신 세부 범위는 데이터자격검정에서 확인하세요.',sources:[['데이터자격검정 SQLD 안내','https://www.dataq.or.kr/www/sub/a_04.do']],steps:['테이블·관계·식별자 개념을 정리하세요.','SELECT·JOIN·집계 쿼리를 작은 데이터로 직접 실행하세요.','틀린 문제의 NULL·조건·집계 결과를 비교하며 복습하세요.']},
 toeic:{scope:['듣기: 사진, 질의응답, 대화, 설명문','읽기: 문법·어휘 빈칸, 지문 완성, 단일·복수 지문 이해'],note:'TOEIC Listening & Reading 기준입니다. Speaking·Writing 시험은 별도입니다.',sources:[['TOEIC 시험 구성','https://exam.toeic.co.kr/common/template/viewContents.php?contentsCode=19']],steps:['일곱 파트의 예제를 풀어 약한 유형을 찾으세요.','듣기는 놓친 표현을 다시 듣고, 읽기는 정답 근거를 표시하세요.','시간을 재어 풀고 어휘·문법·독해 오류를 나눠 복습하세요.']},
 jlpt:{scope:['문자·어휘·문법, 읽기, 듣기 능력을 급수별로 평가합니다.'],note:'공식적으로 빠짐없는 어휘·한자·문법 목록을 공개하지 않습니다. 아래 순서는 학습 제안이며 출제 단어 목록이 아닙니다.',sources:[['JLPT 급수별 시험 구성','https://www.jlpt.jp/e/guideline/testsections.html'],['JLPT 공식 FAQ','https://www.jlpt.jp/sp/e/faq/index.html']],steps:['응시할 급수를 선택해 예제를 확인하세요.','문자·어휘와 문법을 문장으로 익힌 뒤 독해·청해에 적용하세요.','공식 예제로 부족한 영역을 확인하고 반복하세요.'],variants:{
 N5:['문자·어휘, 문법·독해, 청해','가나와 기본 표현 → 짧은 문장 읽기 → 짧은 대화 듣기'],
 N4:['문자·어휘, 문법·독해, 청해','기초 활용 복습 → 생활 지문 읽기 → 대화에서 필요한 정보 찾기'],
 N3:['문자·어휘, 문법·독해, 청해','문법 연결 → 길이가 다른 지문 읽기 → 대화 요점 정리'],
 N2:['언어지식·독해, 청해 (통합 이해 유형 포함)','표현 차이 정리 → 지문 간 주장 비교 → 듣기 정보 통합'],
 N1:['언어지식·독해, 청해 (통합 이해 유형 포함)','문맥 속 어휘 → 긴 글의 논리 비교 → 복합적인 듣기 요점 정리']
 }},
 'history-advanced':{scope:['주요 역사 사건·개념에 대한 이해','역사 자료를 해석하고 시대적 맥락과 쟁점을 파악하는 능력'],note:'한국사능력검정시험 심화 기준입니다. 기본 시험과 구분해 준비하세요.',sources:[['국사편찬위원회 시험 안내','https://www.historyexam.go.kr/pageLink.do?link=examGuideline']],steps:['선사부터 현대까지 큰 흐름을 연표로 정리하세요.','인물·제도·사건을 사료의 단서와 연결하세요.','공식 기출문제를 풀고 시대를 혼동한 이유를 기록하세요.']},
 'information-engineer':{scope:['필기: 소프트웨어 설계·개발, 데이터베이스 구축, 프로그래밍 언어 활용, 정보시스템 구축 관리','실기: 정보처리 실무'],note:'세부 항목은 Q-Net의 응시연도 출제기준을 확인하세요. 필기와 실기는 별도로 준비해야 합니다.',sources:[['Q-Net 정보처리기사 및 출제기준','https://www.q-net.or.kr/crf005.do?id=crf00503&jmCd=1320']],steps:['필기 과목별 핵심 용어와 전체 개발 흐름을 연결하세요.','코드 실행 결과와 SQL을 직접 풀어보세요.','실기는 답을 직접 작성하며 틀린 개념을 보완하세요.']},
 'computer-1':{scope:['필기: 컴퓨터·스프레드시트·데이터베이스 일반','실기: 스프레드시트 및 데이터베이스 실무'],note:'2024~2026년 출제기준을 참고하세요. 실제 시험 프로그램과 세부 작업 범위는 공식 안내가 우선합니다.',sources:[['대한상공회의소 컴활 안내','https://license.korcham.net/co/examguide.do?cd=0103&mm=202'],['2024~2026 출제기준','https://license.korcham.net/co/examguide04Sub.do?cd=0103&mm=51&no=319940&pg=1']],steps:['필기 개념을 정리하며 스프레드시트와 데이터베이스를 구분하세요.','함수·데이터 처리와 데이터베이스 쿼리·폼을 직접 연습하세요.','두 실기 영역을 각각 시간 내 완성하는 연습을 하세요.']},
 'computer-2':{scope:['필기: 컴퓨터 및 스프레드시트 일반','실기: 스프레드시트 실무'],note:'1급의 데이터베이스 과목과 혼동하지 마세요. 응시연도 출제기준과 시험 프로그램을 확인하세요.',sources:[['대한상공회의소 컴활 안내','https://license.korcham.net/co/examguide.do?cd=0103&mm=202']],steps:['컴퓨터 기초와 스프레드시트 개념을 정리하세요.','셀 참조·함수·표·차트 작업을 직접 연습하세요.','작업을 시간 내 마치고 저장 결과를 확인하는 연습을 하세요.']}
};
const el=(tag,text)=>{const node=document.createElement(tag);if(text)node.textContent=text;return node;};
function render(id){
 const guide=guides[id];if(!guide)return null;
 const box=el('details');box.className='exam-study-guide';
 box.append(el('summary','시험범위·공부 가이드'));
 const body=el('div');body.className='exam-guide-body';box.append(body);
 body.append(el('h3','공식 안내 기반 시험범위 요약'));
 const scope=el('ul');guide.scope.forEach(text=>scope.append(el('li',text)));body.append(scope,el('p',guide.note));
 if(guide.variants){
  const label=el('label','JLPT 응시 급수');label.htmlFor='exam-guide-jlpt-level';
  const select=el('select');select.id=label.htmlFor;
  const empty=el('option','급수를 선택하세요');empty.value='';select.append(empty);
  Object.keys(guide.variants).forEach(key=>{const option=el('option',key);option.value=key;select.append(option);});
  const detail=el('p','급수 선택은 가이드 표시용이며 캘린더 일정이나 저장된 시험 선택은 바꾸지 않습니다.');detail.setAttribute('aria-live','polite');
  select.addEventListener('change',()=>{const v=guide.variants[select.value];detail.textContent=v?'공식 시험 구성: '+v[0]+' / 추천 순서: '+v[1]:'급수를 선택하세요.';});
  body.append(label,select,detail);
 }
 body.append(el('h3','추천 공부 순서'));
 body.append(el('small','나다운하루 학습 제안 · 주관기관의 공식 권장 순서가 아닙니다.'));
 const steps=el('ol');guide.steps.forEach(text=>steps.append(el('li',text)));body.append(steps);
 body.append(el('small','안내 정리일: 2026-10-08 · 자동 갱신되지 않습니다. 요약에 없는 세부 범위는 공식 출제기준을 확인하세요.'));
 for(const [title,url] of guide.sources){const a=el('a',title+' (새 창)');a.href=url;a.target='_blank';a.rel='noopener noreferrer';body.append(a);}
 return box;
}
window.DAYFLOW_EXAM_GUIDES=Object.freeze({render});
})();
