import React from 'react';
import { List } from 'react-native-paper';

/**
 * Android (Material 3) session history row for the vehicle detail
 * screen. Same props as the shared SessionRow; on Android it renders a
 * Paper List item themed from the brand tokens.
 */
interface SessionRowProps {
    title: string;
    date: string;
    onPress: () => void;
    testID?: string;
}

export function SessionRow({ title, date, onPress, testID }: SessionRowProps) {
    return (
        <List.Item
            title={title}
            description={date}
            onPress={onPress}
            testID={testID}
            right={(props) => <List.Icon {...props} icon="chevron-right" />}
        />
    );
}
