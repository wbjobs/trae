#include <QApplication>
#include "MainWindow.h"

int main(int argc, char* argv[])
{
    QApplication app(argc, argv);
    app.setApplicationName("BatchRenameTool");
    app.setApplicationVersion("1.0");
    app.setOrganizationName("BatchRename");

    MainWindow window;
    window.show();

    return app.exec();
}
