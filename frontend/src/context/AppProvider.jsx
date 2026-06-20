import React from "react";
import { AppStatusProvider } from "@/context/AppStatusContext";
import { TabsProvider } from "@/context/TabsContext";
import { EnvironmentsProvider } from "@/context/EnvironmentsContext";
import { HistoryProvider } from "@/context/HistoryContext";
import { RequestsProvider } from "@/context/RequestsContext";
import { CollectionsProvider } from "@/context/CollectionsContext";
import { MockServerProvider } from "@/context/MockServerContext";
import { AppBootstrap } from "@/context/AppBootstrap";

export function AppProvider({ children }) {
  return (
    <AppStatusProvider>
      <TabsProvider>
        <EnvironmentsProvider>
          <HistoryProvider>
            <RequestsProvider>
              <CollectionsProvider>
                <MockServerProvider>
                  <AppBootstrap>{children}</AppBootstrap>
                </MockServerProvider>
              </CollectionsProvider>
            </RequestsProvider>
          </HistoryProvider>
        </EnvironmentsProvider>
      </TabsProvider>
    </AppStatusProvider>
  );
}
