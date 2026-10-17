import XCTest
final class VisitDeviceTests: XCTestCase {
    func testConnectionAndVisit() throws {
        let app=XCUIApplication();app.launch()
        XCTAssertTrue(app.navigationBars["TechBridge 拜访"].waitForExistence(timeout:15))
        let connected=app.staticTexts.containing(NSPredicate(format:"label BEGINSWITH %@","已连接 ·")).firstMatch
        XCTAssertTrue(connected.waitForExistence(timeout:60),"请在iPhone允许本地网络；Mac需同一局域网")
        let customer=app.textFields["客户 / 公司"]
        customer.tap();customer.typeText("设备联调测试（非真实客户）")
        app.textFields["此次拜访目标"].tap();app.textFields["此次拜访目标"].typeText("实机连接与录音测试")
        app.buttons["开始新的客户拜访"].tap()
        XCTAssertTrue(app.staticTexts["当前客户：设备联调测试（非真实客户）"].waitForExistence(timeout:15))
        let image=XCTAttachment(screenshot:app.screenshot());image.name="iPhone拜访控制台";image.lifetime = .keepAlways;add(image)
    }
}
