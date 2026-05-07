use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    Manager, WebviewUrl, WebviewWindowBuilder,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let change_server = MenuItemBuilder::with_id("change_server", "Change Server")
                .accelerator("CmdOrCtrl+Shift+S")
                .build(app)?;

            let menu = MenuBuilder::new(app).items(&[&change_server]).build()?;

            app.on_menu_event(|app, event| {
                if event.id() == "change_server" {
                    if let Some(window) = app.get_webview_window("main") {
                        if let Ok(url) = "tauri://localhost/index.html?change=1".parse() {
                            let _ = window.navigate(url);
                        }
                    }
                }
            });

            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("KanbanFlow")
                .inner_size(1280.0, 800.0)
                .min_inner_size(900.0, 600.0)
                .menu(menu)
                .on_navigation(|_url| true)
                .build()?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
