export const tossConfig = {
    // 토스페이먼츠 개발자센터에서 발급받은 클라이언트 키를 넣어주세요.
    // 예) test_ck_... 또는 live_ck_...
    clientKey: "test_ck_Ba5PzR0ArnyPE9RXDWqkVvmYnNeD",

    // 결제 요청 기본값
    amount: 39000,
    orderName: "FlowButler 유료 플랜",

    // 결제 완료/실패 후 돌아올 경로
    successPath: "/dashboard.html?payment=success",
    failPath: "/dashboard.html?payment=fail",
};
